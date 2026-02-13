import { promises as fs } from 'fs';
import fsSync from 'fs';
import { Readable } from 'stream';
import { randomBytes } from 'crypto';
import path from 'path';
import { ProjectStatus } from '@/shared/constants/status';
import type { TemplateCustomData } from '@/shared/templates/custom-data';
import { loadConfig } from './config';
import { log } from './logger';

const cfg = loadConfig();

function buildUrl(base: string, target: string) {
  const normalized = target.startsWith('/') ? target : `/${target}`;
  return new URL(normalized, base).toString();
}

function guessMime(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.wav':
      return 'audio/wav';
    case '.mp3':
      return 'audio/mpeg';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

function shouldTrace(target: string, method?: string | null) {
  const m = (method || 'GET').toUpperCase();
  const verbose = process.env.DAEMON_TRACE_VERBOSE === '1' || process.env.DAEMON_TRACE_VERBOSE === 'true';
  // Always trace these critical writes
  if (m === 'POST') {
    if (/\/api\/daemon\/projects\/.+\/status$/.test(target)) return true; // advance status
    if (/\/api\/daemon\/jobs\/.+\/status$/.test(target)) return true; // job done/failed
    if (/\/api\/daemon\/jobs$/.test(target)) return true; // create job
    if (/\/api\/daemon\/jobs\/.+\/claim$/.test(target)) return true; // claim job
    if (/\/api\/daemon\/projects\/.+\/assets$/.test(target)) return verbose; // asset registration (optional)
  }
  // Read paths: enable only when verbose
  if (!verbose) return false;
  if (/\/api\/daemon\/jobs\/queue/.test(target)) return true;
  if (/\/api\/daemon\/projects\/eligible/.test(target)) return true;
  if (/\/api\/daemon\/jobs\/exists/.test(target)) return true;
  return false;
}

function take(str: string, max = 4000) {
  return str.length <= max ? str : str.slice(0, max) + `… (${str.length - max} more)`;
}

async function requestJsonWithBase<T>(baseUrl: string, target: string, init: RequestInit = {}, label = 'API') {
  const url = buildUrl(baseUrl, target);
  const headers = new Headers(init.headers || {});
  headers.set('accept', 'application/json');
  headers.set('x-daemon-password', cfg.apiPassword);
  headers.set('x-daemon-id', cfg.daemonId);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
  const startedAt = Date.now();
  const traceOn = shouldTrace(target, (init as any)?.method || null);
  const reqBody = ((): string | null => {
    try {
      if (!init.body || isFormData) return null;
      if (typeof init.body === 'string') return init.body;
      // node-fetch/undici might pass a Readable; avoid consuming streams in tracing
      return null;
    } catch { return null; }
  })();
  try {
    if (traceOn) {
      log.info('HTTP TRACE request', {
        url,
        method: (init as any)?.method || 'GET',
        body: reqBody ? take(reqBody) : null,
        timeoutMs: cfg.requestTimeoutMs,
      });
    }
    const requestInit: RequestInit & { duplex?: 'half' } = { ...init, headers, signal: controller.signal };
    if (init.body && typeof init.body === 'object') {
      (requestInit as any).duplex = 'half';
    }
    const response = await fetch(url, requestInit);
    const contentType = response.headers.get('content-type') || '';
    const expectsJson = contentType.includes('application/json');
    let payload: any = null;
    if (expectsJson) {
      try {
        payload = await response.json();
      } catch (err) {
        if (response.ok) {
          throw new Error(`Failed to parse JSON response from ${url}`);
        }
      }
    } else {
      payload = await response.text();
    }
    if (traceOn) {
      log.info('HTTP TRACE response', {
        url,
        method: (init as any)?.method || 'GET',
        status: response.status,
        durationMs: Date.now() - startedAt,
        body: typeof payload === 'string' ? take(payload) : payload,
      });
    }
    if (!response.ok) {
      const message = typeof payload === 'string'
        ? payload
        : payload?.error?.message || payload?.message || JSON.stringify(payload);
      throw new Error(`Daemon ${label} ${response.status} ${response.statusText} (${url}): ${message}`);
    }
    return payload as T;
  } catch (err: any) {
    if (traceOn) {
      log.error('HTTP TRACE error', {
        url,
        method: (init as any)?.method || 'GET',
        durationMs: Date.now() - startedAt,
        error: err?.message || String(err),
      });
    }
    if (err?.name === 'AbortError') {
      throw new Error(`Request to ${label} ${url} timed out after ${cfg.requestTimeoutMs}ms`);
    }
    if (err instanceof Error) {
      throw new Error(`${err.message} (Request URL: ${url})`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson<T>(target: string, init: RequestInit = {}) {
  return requestJsonWithBase<T>(cfg.apiBaseUrl, target, init, 'API');
}

async function requestStorageJson<T>(target: string, init: RequestInit = {}) {
  return requestJsonWithBase<T>(cfg.storageBaseUrl, target, init, 'Storage API');
}

type StorageUploadResponse = {
  kind: 'audio' | 'image' | 'video';
  path: string;
  url: string;
  isFinal?: boolean;
};

type RegisteredAssetResponse =
  | { kind: 'audio'; id: string; path: string; url: string }
  | { kind: 'image'; id: string; path: string; url: string }
  | { kind: 'video'; id: string; path: string; url: string; isFinal: boolean };

async function uploadAsset(
  projectId: string,
  kind: 'audio' | 'image' | 'video',
  filePath: string,
  isFinal = false,
  languageCode?: string,
) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  // Ensure the file exists before streaming
  try {
    const st = await fs.stat(absolutePath);
    if (!st.isFile()) throw new Error('not a file');
  } catch (err: any) {
    throw new Error(`Unable to access asset at ${absolutePath}: ${err?.message || err}`);
  }
  const storageEndpoint = `/api/storage/projects/${projectId}/assets`;
  const filename = path.basename(absolutePath);
  const fileType = guessMime(absolutePath);
  const fileSize = (await fs.stat(absolutePath)).size;

  // Request signed upload grant from API before hitting storage worker
  const grant = await requestJsonWithBase<{
    data: string;
    signature: string;
    expiresAt: string;
    maxBytes: number;
    mimeTypes: string[];
    kind: string;
    projectId: string;
  }>(cfg.apiBaseUrl, '/api/storage/grant', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      kind,
      maxBytes: fileSize,
      mimeTypes: [fileType],
    }),
  }, 'API');

  if (fileSize > grant.maxBytes) {
    throw new Error(`File too large for granted upload (max ${grant.maxBytes} bytes)`);
  }
  if (grant.mimeTypes && grant.mimeTypes.length > 0 && !grant.mimeTypes.includes(fileType)) {
    throw new Error(`Mime type ${fileType} not allowed by grant`);
  }

  const performUpload = async (baseUrl: string) => {
    // Build a streaming multipart body to avoid buffering the whole file
    const boundary = `----yumcut-upload-${randomBytes(8).toString('hex')}`;
    const CRLF = '\r\n';
    const parts: Buffer[] = [];
    const field = (name: string, value: string) =>
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`);
    parts.push(field('type', kind));
    parts.push(field('data', grant.data));
    parts.push(field('signature', grant.signature));
    if (kind === 'video') parts.push(field('isFinal', isFinal ? 'true' : 'false'));
    if (languageCode) parts.push(field('languageCode', languageCode));
    const fileHeader = Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: ${fileType}${CRLF}${CRLF}`,
    );
    const fileFooter = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
    const fileStream = fsSync.createReadStream(absolutePath);
    try {
      async function* gen() {
        for (const p of parts) yield p;
        yield fileHeader;
        for await (const chunk of fileStream) yield chunk as Buffer;
        yield fileFooter;
      }
      const nodeStream = Readable.from(gen());
      const bodyStream = (Readable as any).toWeb ? (Readable as any).toWeb(nodeStream) : (nodeStream as any);
      return await requestJsonWithBase<StorageUploadResponse>(baseUrl, storageEndpoint, {
        method: 'POST',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        // @ts-ignore: Node.js streaming request bodies require duplex flag
        duplex: 'half',
        body: bodyStream as any,
      }, baseUrl === cfg.storageBaseUrl ? 'Storage API' : 'API');
    } finally {
      try {
        (fileStream as any).close?.();
      } catch {}
      try {
        (fileStream as any).destroy?.();
      } catch {}
    }
  };

  let storageResponse: StorageUploadResponse;
  let storageUploadBase = cfg.storageBaseUrl;
  try {
    storageResponse = await performUpload(cfg.storageBaseUrl);
  } catch (err: any) {
    const message = err?.message || String(err);
    const projectMissing = /Project not found/i.test(message);
    const differentHosts = cfg.storageBaseUrl !== cfg.apiBaseUrl;
    if (projectMissing && differentHosts) {
      log.warn('Storage upload falling back to API host', {
        projectId,
        kind,
        storageBaseUrl: cfg.storageBaseUrl,
        apiBaseUrl: cfg.apiBaseUrl,
        reason: message,
      });
      storageResponse = await performUpload(cfg.apiBaseUrl);
      storageUploadBase = cfg.apiBaseUrl;
    } else {
      throw err;
    }
  }
  const payload: {
    type: typeof kind;
    path: string;
    url: string;
    isFinal?: boolean;
    localPath?: string;
    languageCode?: string;
  } = {
    type: kind,
    path: storageResponse.path,
    url: storageResponse.url,
    ...(kind === 'video' ? { isFinal } : {}),
    localPath: absolutePath,
  };
  if (languageCode) {
    payload.languageCode = languageCode;
  }
  const registerEndpoint = `/api/daemon/projects/${projectId}/assets`;
  const registerRequestUrl = buildUrl(cfg.apiBaseUrl, registerEndpoint);
  const registered = await requestJson<RegisteredAssetResponse>(
    registerEndpoint,
    { method: 'POST', body: JSON.stringify(payload) },
  );
  const kindLabel = (() => {
    if (kind === 'audio') return 'voiceover candidate';
    if (kind === 'image') return 'image asset';
    if (kind === 'video' && isFinal) return 'final video';
    return 'video asset';
  })();
  log.info('Uploaded media asset', {
    projectId,
    type: kindLabel,
    storageRequestUrl: buildUrl(storageUploadBase, storageEndpoint),
    storageUrl: storageResponse.url,
    appRequestUrl: registerRequestUrl,
    appPayloadUrl: payload.url,
    path: registered.path,
  });
  return registered;
}

export type ProjectRow = {
  id: string;
  status: ProjectStatus;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function fetchEligibleProjects(limit: number): Promise<ProjectRow[]> {
  const payload = await requestJson<{ projects: { id: string; status: ProjectStatus; userId: string; createdAt: string; updatedAt: string }[] }>(
    `/api/daemon/projects/eligible?limit=${encodeURIComponent(String(limit))}`,
  );
  return payload.projects.map((p) => ({
    id: p.id,
    status: p.status,
    userId: p.userId,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
  }));
}

export async function getCreationSnapshot(projectId: string): Promise<{
  userId: string;
  autoApproveScript: boolean;
  autoApproveAudio: boolean;
  includeDefaultMusic: boolean;
  addOverlay: boolean;
  useExactTextAsScript: boolean;
  durationSeconds: number | null;
  targetLanguage: string;
  languages?: string[];
  watermarkEnabled: boolean;
  captionsEnabled: boolean;
  scriptCreationGuidanceEnabled: boolean;
  scriptCreationGuidance: string;
  scriptAvoidanceGuidanceEnabled: boolean;
  scriptAvoidanceGuidance: string;
  audioStyleGuidanceEnabled: boolean;
  audioStyleGuidance: string;
  voiceId?: string | null;
  voiceAssignments?: Record<string, {
    voiceId: string | null;
    templateVoiceId: string | null;
    title: string | null;
    speed: string | null;
    gender: string | null;
    voiceProvider?: string | null;
    source: 'project' | 'fallback' | 'none';
  }> | null;
  voiceProviders?: Record<string, string> | null;
  template?: {
    id: string;
    code: string | null;
    title?: string | null;
    description?: string | null;
    previewImageUrl?: string | null;
    previewVideoUrl?: string | null;
    customData?: TemplateCustomData | null;
    overlay?: {
      id: string;
      title?: string | null;
      url?: string | null;
      description?: string | null;
    } | null;
    music?: {
      id: string;
      title?: string | null;
      url?: string | null;
      description?: string | null;
    } | null;
    captionsStyle?: {
      id: string;
      title?: string | null;
      description?: string | null;
      externalId?: string | null;
    } | null;
    artStyle?: {
      id: string;
      title?: string | null;
      description?: string | null;
      prompt?: string | null;
      referenceImageUrl?: string | null;
    } | null;
  } | null;
  characterSelection?: {
    type: 'global' | 'user' | null;
    characterId?: string | null;
    userCharacterId?: string | null;
    variationId?: string | null;
    imagePath?: string | null;
    absoluteImagePath?: string | null;
    imageUrl?: string | null;
  } | null;
}> {
  return requestJson(`/api/daemon/projects/${projectId}/creation-snapshot`);
}

export async function setStatus(projectId: string, status: ProjectStatus, message?: string | null, extra?: Record<string, unknown>) {
  const body = JSON.stringify({ status, message: message ?? undefined, extra });
  try {
    await requestJson(`/api/daemon/projects/${projectId}/status`, { method: 'POST', body });
  } catch (errFirst) {
    // One quick retry in case of transient timeout/proxy blip
    await new Promise((r) => setTimeout(r, 200));
    await requestJson(`/api/daemon/projects/${projectId}/status`, { method: 'POST', body });
  }
}

export async function upsertScript(projectId: string, text: string, languageCode?: string) {
  await requestJson(`/api/daemon/projects/${projectId}/script`, {
    method: 'POST',
    body: JSON.stringify({ text, languageCode }),
  });
}

export async function getScriptText(projectId: string, languageCode?: string): Promise<string | null> {
  const url = languageCode
    ? `/api/daemon/projects/${projectId}/script?language=${encodeURIComponent(languageCode)}`
    : `/api/daemon/projects/${projectId}/script`;
  const res = await requestJson<{ text: string | null }>(url);
  return typeof res.text === 'string' ? res.text : null;
}

export async function getTranscriptionSnapshot(projectId: string): Promise<{
  finalVoiceoverId: string | null;
  localPath: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  finalVoiceovers: Record<string, { id: string; path: string | null; publicUrl: string | null; localPath: string | null }>;
}> {
  return requestJson(`/api/daemon/projects/${projectId}/transcription-snapshot`);
}

export async function addAudioCandidate(projectId: string, filePath: string, languageCode?: string | null): Promise<{ id: string; path: string; url: string; localPath: string }> {
  const res = await uploadAsset(projectId, 'audio', filePath, false, languageCode ?? undefined);
  if (res.kind !== 'audio') {
    throw new Error(`Unexpected asset response: expected audio, received ${res.kind}`);
  }
  return { id: res.id, path: res.path, url: res.url, localPath: filePath };
}

export async function addImageAsset(projectId: string, filePath: string): Promise<{ id: string; path: string; url: string; localPath: string }> {
  const res = await uploadAsset(projectId, 'image', filePath, false);
  if (res.kind !== 'image') {
    throw new Error(`Unexpected asset response: expected image, received ${res.kind}`);
  }
  return { id: res.id, path: res.path, url: res.url, localPath: filePath };
}

export async function uploadCharacterImage(projectId: string, filePath: string) {
  if (!projectId || projectId.trim().length === 0) {
    throw new Error('uploadCharacterImage requires projectId');
  }
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  let stats;
  try {
    stats = await fs.stat(absolutePath);
    if (!stats.isFile()) throw new Error('not a file');
  } catch (err: any) {
    throw new Error(`Unable to access image at ${absolutePath}: ${err?.message || err}`);
  }
  const boundary = `----yumcut-upload-${randomBytes(8).toString('hex')}`;
  const CRLF = '\r\n';
  const filename = path.basename(absolutePath);
  const fileType = guessMime(absolutePath);
  const fileSize = stats.size;

  const grant = await requestJsonWithBase<{
    data: string;
    signature: string;
    expiresAt: string;
    maxBytes: number;
    mimeTypes: string[];
    kind: string;
    projectId: string;
  }>(cfg.apiBaseUrl, '/api/storage/grant', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      kind: 'character-image',
      maxBytes: fileSize,
      mimeTypes: [fileType],
    }),
  }, 'API');

  if (fileSize > grant.maxBytes) {
    throw new Error(`File too large for granted upload (max ${grant.maxBytes} bytes)`);
  }
  if (grant.mimeTypes && grant.mimeTypes.length > 0 && !grant.mimeTypes.includes(fileType)) {
    throw new Error(`Mime type ${fileType} not allowed by grant`);
  }

  const parts: Buffer[] = [];
  const field = (name: string, value: string) =>
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`);
  parts.push(field('data', grant.data));
  parts.push(field('signature', grant.signature));
  const fileHeader = Buffer.from(
    `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: ${fileType}${CRLF}${CRLF}`,
  );
  const fileFooter = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
  const stream = fsSync.createReadStream(absolutePath);
  async function* gen() {
    for (const part of parts) yield part;
    yield fileHeader;
    for await (const chunk of stream) yield chunk as Buffer;
    yield fileFooter;
  }
  const nodeStream2 = Readable.from(gen());
  const bodyStream = (Readable as any).toWeb ? (Readable as any).toWeb(nodeStream2) : (nodeStream2 as any);
  return requestStorageJson<{ path: string; url: string }>('/api/storage/characters', {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: bodyStream as any,
  });
}

export async function registerGeneratedCharacter(projectId: string, payload: { path?: string | null; url?: string | null; title?: string | null; description?: string | null }) {
  return requestJson(`/api/daemon/projects/${projectId}/character/generated`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function setFinalVideo(projectId: string, filePath: string, languageCode?: string | null) {
  await uploadAsset(projectId, 'video', filePath, true, languageCode ?? undefined);
}

export type JobRow = {
  id: string;
  projectId: string;
  type: string;
  status: string;
  createdAt: Date;
  payload: Record<string, unknown> | null;
};

export async function findQueuedJobs(limit: number): Promise<JobRow[]> {
  const payload = await requestJson<{ jobs: { id: string; projectId: string; type: string; status: string; createdAt: string; payload?: Record<string, unknown> | null }[] }>(
    `/api/daemon/jobs/queue?limit=${encodeURIComponent(String(limit))}`,
  );
  return payload.jobs.map((job) => ({
    id: job.id,
    projectId: job.projectId,
    type: job.type,
    status: job.status,
    createdAt: new Date(job.createdAt),
    payload: job.payload ?? null,
  }));
}

export async function claimJob(id: string): Promise<boolean> {
  const payload = await requestJson<{ claimed: boolean }>(`/api/daemon/jobs/${id}/claim`, { method: 'POST' });
  return !!payload.claimed;
}

export async function setJobStatus(id: string, status: 'queued' | 'running' | 'done' | 'failed' | 'paused') {
  const body = JSON.stringify({ status });
  try {
    await requestJson(`/api/daemon/jobs/${id}/status`, { method: 'POST', body });
  } catch (errFirst) {
    // One quick retry to avoid leaving jobs stuck as 'running' on transient failures
    await new Promise((r) => setTimeout(r, 200));
    await requestJson(`/api/daemon/jobs/${id}/status`, { method: 'POST', body });
  }
}

export async function jobExistsFor(projectId: string, type: string): Promise<boolean> {
  const payload = await requestJson<{ exists: boolean }>(
    `/api/daemon/jobs/exists?projectId=${encodeURIComponent(projectId)}&type=${encodeURIComponent(type)}`,
  );
  return !!payload.exists;
}

export async function createJob(projectId: string, userId: string, type: string, payload?: Record<string, unknown>) {
  await requestJson(`/api/daemon/jobs`, {
    method: 'POST',
    body: JSON.stringify({ projectId, userId, type, payload }),
  });
}

export type LanguageProgressAggregate = {
  progress: Array<{
    languageCode: string;
    transcriptionDone: boolean;
    captionsDone: boolean;
    videoPartsDone: boolean;
    finalVideoDone: boolean;
    disabled: boolean;
    failedStep: string | null;
    failureReason: string | null;
  }>;
  aggregate: {
    transcription: { done: boolean; remaining: string[] };
    captions: { done: boolean; remaining: string[] };
    videoParts: { done: boolean; remaining: string[] };
    finalVideo: { done: boolean; remaining: string[] };
  };
};

export async function getLanguageProgress(projectId: string): Promise<LanguageProgressAggregate> {
  return requestJson(`/api/daemon/projects/${projectId}/language-progress`);
}

export async function updateLanguageProgress(projectId: string, payload: { languageCode: string } & Record<string, boolean | string | null | undefined>) {
  return requestJson(`/api/daemon/projects/${projectId}/language-progress`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function formatFailureReason(reason: string | null | undefined): string | null {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  if (!trimmed) return null;
  const max = 512;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 3)}...`;
}

function normalizeStep(step: string | null | undefined): string | null {
  if (typeof step !== 'string') return null;
  const trimmed = step.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export async function markLanguageFailure(projectId: string, languageCode: string, step: string | null | undefined, reason?: string | null) {
  const formattedReason = formatFailureReason(reason ?? null);
  const payload = {
    languageCode,
    disabled: true,
    failedStep: normalizeStep(step),
    failureReason: formattedReason,
  } as const;
  try {
    await updateLanguageProgress(projectId, payload);
  } catch (err: any) {
    log.warn('Failed to persist language failure marker', {
      projectId,
      languageCode,
      step: normalizeStep(step),
      error: err?.message || String(err),
    });
  }
}

// Heartbeat removed by request; cleanup script handles stale jobs.

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function verifyHealth(baseUrl: string, rawPath: string, label: string) {
  const targetPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const url = buildUrl(baseUrl, targetPath);
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      log.info(`${label} health check`, { url, attempt });
      await requestJsonWithBase(baseUrl, targetPath, {}, label);
      return;
    } catch (err: any) {
      const last = attempt === maxAttempts;
      log.error(`${label} health check failed`, { url, attempt, error: err?.message || String(err) });
      if (last) throw err;
      await sleep(Math.min(500, Math.max(100, Math.floor(cfg.requestTimeoutMs / 10))));
    }
  }
}

export async function verifyServicesAccess() {
  await verifyHealth(cfg.apiBaseUrl, cfg.healthPath, 'API');
  await verifyHealth(cfg.storageBaseUrl, cfg.storageHealthPath, 'Storage API');
}
