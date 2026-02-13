import http, { IncomingMessage, ServerResponse } from 'http';
import { findFreePort } from './ports';
import { makeVirtualPrisma } from '../../daemon-and-api/virtual-prisma';

function getSharedPrisma() {
  const g = globalThis as any;
  if (!g.__fakeApiPrisma) {
    g.__fakeApiPrisma = makeVirtualPrisma();
  }
  return g.__fakeApiPrisma;
}

const prisma = getSharedPrisma();

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL, body: any) => void | Promise<void>;

function aggregateProgress(progress: Array<{ languageCode: string; transcriptionDone: boolean; captionsDone: boolean; videoPartsDone: boolean; finalVideoDone: boolean }>) {
  const compute = (field: 'transcriptionDone' | 'captionsDone' | 'videoPartsDone' | 'finalVideoDone') => ({
    done: progress.length > 0 && progress.every((row) => row[field]),
    remaining: progress.filter((row) => !row[field]).map((row) => row.languageCode),
  });
  return {
    transcription: compute('transcriptionDone'),
    captions: compute('captionsDone'),
    videoParts: compute('videoPartsDone'),
    finalVideo: compute('finalVideoDone'),
  };
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
  });
}

function sendJson(res: ServerResponse, code: number, payload: any) {
  const body = JSON.stringify(payload);
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(body);
}

function withAuth(expectedPassword: string, fn: Handler): Handler {
  return (req, res, url, body) => {
    const password = String(req.headers['x-daemon-password'] || '');
    const daemonId = String(req.headers['x-daemon-id'] || '');
    if (password !== expectedPassword || !daemonId) {
      return sendJson(res, 403, { error: { message: 'Forbidden' } });
    }
    return fn(req, res, url, body);
  };
}

function notFound(res: ServerResponse) { sendJson(res, 404, { error: { message: 'Not Found' } }); }

export type ApiServer = {
  baseUrl: string;
  close: () => Promise<void>;
  set: (route: string, handler: Handler) => void;
  calls: { method: string; path: string }[];
  state: {
    projects: { id: string; status: string; userId: string; createdAt: string; updatedAt: string }[];
    jobs: { id: string; projectId: string; type: string; status: string; createdAt: string; payload?: any }[];
    scripts: Record<string, string>;
    statuses: Record<string, { status: string; message?: string | null }>;
    assets: {
      id: string;
      projectId: string;
      kind: 'audio' | 'image' | 'video';
      path: string;
      url: string;
      isFinal?: boolean;
      localPath?: string;
    }[];
    finalAudios: Record<string, Record<string, { id: string; path: string; url: string; localPath?: string | null }>>;
  };
};

export async function startFakeApiServer(opts: { password: string; initial?: Partial<ApiServer['state']> }): Promise<ApiServer> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const calls: { method: string; path: string }[] = [];
  const state: ApiServer['state'] = {
    projects: [],
    jobs: [],
    scripts: {},
    statuses: {},
    assets: [],
    finalAudios: {},
    ...(opts.initial || {}),
  } as any;

  const routes = new Map<string, Handler>();

  // Default handlers
  routes.set('GET /api/daemon/health', withAuth(opts.password, async (_req, res) => {
    sendJson(res, 200, { ok: true, time: new Date().toISOString() });
  }));

  routes.set('POST /api/storage/grant', withAuth(opts.password, async (_req, res, _url, body) => {
    const projectId = body?.projectId || 'unknown';
    const kind = body?.kind || 'audio';
    const maxBytes = typeof body?.maxBytes === 'number' ? body.maxBytes : 1024 * 1024 * 1024;
    const mimeTypes = Array.isArray(body?.mimeTypes) && body.mimeTypes.length > 0 ? body.mimeTypes : ['audio/wav', 'audio/mpeg', 'audio/mp4', 'image/png', 'image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm'];
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    sendJson(res, 200, {
      data: '{}',
      signature: 'fake-signature',
      expiresAt,
      maxBytes,
      mimeTypes,
      kind,
      projectId,
    });
  }));

  routes.set('GET /api/daemon/projects/eligible', withAuth(opts.password, async (_req, res, url) => {
    const limit = Number(url.searchParams.get('limit') || '10');
    sendJson(res, 200, { projects: state.projects.slice(0, limit) });
  }));

  routes.set('GET /api/daemon/jobs/queue', withAuth(opts.password, async (_req, res, url) => {
    const limit = Number(url.searchParams.get('limit') || '10');
    const queued = state.jobs.filter((j) => j.status === 'queued').slice(0, limit);
    sendJson(res, 200, { jobs: queued });
  }));

  routes.set('POST /api/daemon/jobs', withAuth(opts.password, async (_req, res, _url, body) => {
    const id = `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    state.jobs.push({ id, status: 'queued', createdAt: new Date().toISOString(), ...(body || {}) });
    sendJson(res, 200, { ok: true, id });
  }));

  routes.set('POST /api/daemon/jobs/:id/claim', withAuth(opts.password, async (_req, res, url) => {
    const m = url.pathname.match(/\/api\/daemon\/jobs\/([^/]+)\/claim/);
    const id = m?.[1];
    const job = state.jobs.find((j) => j.id === id);
    if (job && job.status === 'queued') { job.status = 'running'; return sendJson(res, 200, { claimed: true }); }
    return sendJson(res, 200, { claimed: false });
  }));

  routes.set('POST /api/daemon/jobs/:id/status', withAuth(opts.password, async (_req, res, url, body) => {
    const m = url.pathname.match(/\/api\/daemon\/jobs\/([^/]+)\/status/);
    const id = m?.[1];
    const job = state.jobs.find((j) => j.id === id);
    if (job) job.status = (body?.status || job.status);
    sendJson(res, 200, { ok: true });
  }));

  routes.set('GET /api/daemon/jobs/exists', withAuth(opts.password, async (_req, res, url) => {
    const projectId = String(url.searchParams.get('projectId'));
    const type = String(url.searchParams.get('type'));
    const exists = state.jobs.some((j) => j.projectId === projectId && j.type === type && j.status === 'queued');
    sendJson(res, 200, { exists });
  }));

  routes.set('GET /api/daemon/projects/:id/creation-snapshot', withAuth(opts.password, async (_req, res, url) => {
    const m = url.pathname.match(/\/api\/daemon\/projects\/([^/]+)\/creation-snapshot/);
    const id = m?.[1] || 'unknown';
    const defaults = {
      autoApproveScript: true,
      autoApproveAudio: true,
      includeDefaultMusic: true,
      addOverlay: true,
      useExactTextAsScript: false,
      durationSeconds: 8,
      targetLanguage: 'en',
      watermarkEnabled: false,
      captionsEnabled: false,
      scriptCreationGuidanceEnable: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: false,
      audioStyleGuidance: '',
      characterSelection: null,
      template: {
        id: 'tpl_basic',
        code: 'basic',
        overlay: {
          id: 'tpl_overlay_sparkles',
          title: 'Sparkles',
          url: '/content/overlay/sparkles-9_16-20s-transparent.webm',
          description: 'Test overlay',
        },
        music: {
          id: 'tpl_music_default',
          title: 'Backbeat Groove',
          url: '/content/music/my-2-back.wav',
          description: 'Test music',
        },
        captionsStyle: {
          id: 'tpl_captions_acid',
          title: 'Acid',
          description: 'Test acid captions style',
          externalId: 'acid',
        },
        artStyle: {
          id: 'tpl_art_basic',
          title: 'Basic Cartoon',
          description: 'Test art style',
          prompt: 'Test art style prompt',
          referenceImageUrl: null,
        },
        transitions: 'basic',
      },
      voiceId: 'english-primary-voice',
      voiceProviders: {
        'english-primary-voice': 'minimax',
      },
      voiceAssignments: {
        en: {
          voiceId: 'english-primary-voice',
          templateVoiceId: 'tpl-voice-en-fast',
          title: 'English Fast Female',
          speed: 'fast',
          gender: 'female',
          voiceProvider: 'minimax',
          source: 'project',
        },
      },
    };
    sendJson(res, 200, defaults);
  }));

routes.set('POST /api/daemon/projects/:id/status', withAuth(opts.password, async (_req, res, url, body) => {
    const m = url.pathname.match(/\/api\/daemon\/projects\/([^/]+)\/status/);
    const id = m?.[1] || 'unknown';
    state.statuses[id] = { status: body?.status, message: body?.message };
    const extra = body?.extra || {};
    if (extra && extra.finalVoiceovers) {
      const entries = Object.entries(extra.finalVoiceovers as Record<string, string>);
      const audioAssets = state.assets.filter((asset) => asset.projectId === id && asset.kind === 'audio');
      const map: Record<string, { id: string; path: string; url: string; localPath?: string | null }> = {};
      for (const asset of audioAssets) {
        asset.isFinal = false;
      }
      for (const [languageCode, audioId] of entries) {
        const hit = audioAssets.find((asset) => asset.id === audioId);
        if (hit) {
          hit.isFinal = true;
          map[languageCode] = {
            id: hit.id,
            path: hit.path,
            url: hit.url,
            localPath: hit.localPath,
          };
        }
      }
      state.finalAudios[id] = map;
    }
    sendJson(res, 200, { ok: true });
  }));

  routes.set('GET /api/daemon/projects/:id/script', withAuth(opts.password, async (_req, res, url) => {
    const m = url.pathname.match(/\/api\/daemon\/projects\/([^/]+)\/script/);
    const id = m?.[1] || 'unknown';
    sendJson(res, 200, { text: state.scripts[id] || null });
  }));

  routes.set('POST /api/daemon/projects/:id/script', withAuth(opts.password, async (_req, res, url, body) => {
    const m = url.pathname.match(/\/api\/daemon\/projects\/([^/]+)\/script/);
    const id = m?.[1] || 'unknown';
    state.scripts[id] = String(body?.text || '');
    sendJson(res, 200, { ok: true });
  }));

  routes.set('GET /api/daemon/projects/:id/transcription-snapshot', withAuth(opts.password, async (_req, res, url) => {
    const m = url.pathname.match(/\/api\/daemon\/projects\/([^/]+)\/transcription-snapshot/);
    const projectId = m?.[1] || 'unknown';
    const lastAudio = [...state.assets].reverse().find((a) => a.kind === 'audio' && a.projectId === projectId);
    const finalMap = state.finalAudios[projectId] || {};
    const firstFinal = Object.values(finalMap)[0] || null;
    sendJson(res, 200, {
      finalVoiceoverId: firstFinal?.id || lastAudio?.id || null,
      localPath: firstFinal?.localPath || lastAudio?.localPath || null,
      storagePath: firstFinal?.path || lastAudio?.path || null,
      publicUrl: firstFinal?.url || lastAudio?.url || null,
      finalVoiceovers: finalMap,
    });
  }));

  routes.set('GET /api/daemon/projects/:id/language-progress', withAuth(opts.password, async (_req, res, url) => {
    const m = url.pathname.match(/\/api\/daemon\/projects\/([^/]+)\/language-progress/);
    const projectId = m?.[1] || 'unknown';
    const progress = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
    const normalized = progress.map((row: any) => ({
      languageCode: row.languageCode,
      transcriptionDone: row.transcriptionDone,
      captionsDone: row.captionsDone,
      videoPartsDone: row.videoPartsDone,
      finalVideoDone: row.finalVideoDone,
    }));
    sendJson(res, 200, { progress: normalized, aggregate: aggregateProgress(normalized) });
  }));

  routes.set('POST /api/daemon/projects/:id/language-progress', withAuth(opts.password, async (_req, res, url, body) => {
    const m = url.pathname.match(/\/api\/daemon\/projects\/([^/]+)\/language-progress/);
    const projectId = m?.[1] || 'unknown';
    const languageCode = String(body?.languageCode || 'en').toLowerCase();
    await prisma.projectLanguageProgress.upsert({
      where: { projectId_languageCode: { projectId, languageCode } },
      update: {
        transcriptionDone: body?.transcriptionDone ?? undefined,
        captionsDone: body?.captionsDone ?? undefined,
        videoPartsDone: body?.videoPartsDone ?? undefined,
        finalVideoDone: body?.finalVideoDone ?? undefined,
      },
      create: {
        projectId,
        languageCode,
        transcriptionDone: body?.transcriptionDone ?? false,
        captionsDone: body?.captionsDone ?? false,
        videoPartsDone: body?.videoPartsDone ?? false,
        finalVideoDone: body?.finalVideoDone ?? false,
      },
    });
    const progress = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
    const normalized = progress.map((row: any) => ({
      languageCode: row.languageCode,
      transcriptionDone: row.transcriptionDone,
      captionsDone: row.captionsDone,
      videoPartsDone: row.videoPartsDone,
      finalVideoDone: row.finalVideoDone,
    }));
    sendJson(res, 200, { progress: normalized, aggregate: aggregateProgress(normalized) });
  }));

  // Register uploaded media back to API
  routes.set('POST /api/daemon/projects/:id/assets', withAuth(opts.password, async (_req, res, url, body) => {
    const m = url.pathname.match(/\/api\/daemon\/projects\/([^/]+)\/assets/);
    const projectId = m?.[1] || 'unknown';
    const kind = String(body?.type || '');
    const pathStr = String(body?.path || '');
    const urlStr = String(body?.url || '');
    const isFinal = body?.isFinal === true;
    const localPath = typeof body?.localPath === 'string' ? body.localPath : undefined;
    const id = `asset_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    state.assets.push({ id, projectId, kind, path: pathStr, url: urlStr, isFinal, localPath } as any);
    if (kind === 'audio') return sendJson(res, 200, { kind: 'audio', id, path: pathStr, url: urlStr });
    if (kind === 'image') return sendJson(res, 200, { kind: 'image', id, path: pathStr, url: urlStr });
    if (kind === 'video') return sendJson(res, 200, { kind: 'video', id, path: pathStr, url: urlStr, isFinal });
    sendJson(res, 400, { error: { message: 'Unknown kind' } });
  }));

  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) return notFound(res);
    const url = new URL(req.url, baseUrl);
    calls.push({ method: req.method, path: url.pathname });
    const body = await readJson(req);
    const keyExact = `${req.method} ${url.pathname}`;
    const keyGrouped = `${req.method} ${url.pathname.replace(/\/[\w-]+\/(status|claim|script|creation-snapshot|complete)$/i, '/:id/$1')}`;
    const keyProject = `${req.method} ${url.pathname.replace(/\/api\/daemon\/projects\/([^/]+)\/(.*)/, '/api/daemon/projects/:id/$2')}`;
    const keyJob = `${req.method} ${url.pathname.replace(/\/api\/daemon\/jobs\/([^/]+)\/(.*)/, '/api/daemon/jobs/:id/$2')}`;
    const handler = routes.get(keyExact) || routes.get(keyGrouped) || routes.get(keyProject) || routes.get(keyJob) || routes.get(keyExact.split('?')[0]);
    if (handler) return handler(req, res, url, body);
    notFound(res);
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));

  return {
    baseUrl,
    calls,
    state,
    set(route: string, handler: Handler) { routes.set(route, handler); },
    async close() { await new Promise<void>((resolve) => server.close(() => resolve())); },
  };
}

export type StorageServer = {
  baseUrl: string;
  calls: { method: string; path: string }[];
  close: () => Promise<void>;
  state: {
    uploads: { projectId: string; type: string; isFinal?: boolean; path: string; url: string }[];
  };
};

export async function startFakeStorageServer(): Promise<StorageServer> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const calls: { method: string; path: string }[] = [];
  const state = { uploads: [] as { projectId: string; type: string; isFinal?: boolean; path: string; url: string }[] };
  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) return notFound(res);
    const url = new URL(req.url, baseUrl);
    calls.push({ method: req.method, path: url.pathname });
    if (req.method === 'GET' && url.pathname === '/api/storage/health') {
      return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
    }
    if (req.method === 'POST' && /\/api\/storage\/projects\/([^/]+)\/assets/.test(url.pathname)) {
      const m = url.pathname.match(/\/api\/storage\/projects\/([^/]+)\/assets/);
      const projectId = m?.[1] || 'unknown';
      // Sniff multipart body to extract `type` and `isFinal`
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => { req.on('data', (c) => chunks.push(Buffer.from(c))); req.on('end', () => resolve()); });
      const bodyStr = Buffer.concat(chunks).toString('utf8');
      function field(name: string): string | null {
        const re = new RegExp(`name=\"${name}\"\r\n\r\n([\s\S]*?)\r\n`, 'm');
        const m = re.exec(bodyStr);
        return m ? m[1] : null;
      }
      const typeField = field('type');
      const isFinalField = field('isFinal');
      const fileNameMatch = /filename=\"([^\"]+)\"/i.exec(bodyStr);
      const fileName = fileNameMatch ? fileNameMatch[1] : '';
      const lowerName = fileName.toLowerCase();
      const rand = Math.random().toString(36).slice(2);
      let kind: 'audio' | 'image' | 'video';
      if (typeField === 'video' || typeField === 'image' || typeField === 'audio') {
        kind = typeField as any;
      } else if (/(\.mp4|\.webm)$/i.test(lowerName)) {
        kind = 'video';
      } else if (/(\.png|\.jpg|\.jpeg)$/i.test(lowerName)) {
        kind = 'image';
      } else {
        kind = 'audio';
      }
      const ext = kind === 'audio' ? 'wav' : kind === 'image' ? 'png' : 'mp4';
      const pathStr = `${kind}/${projectId}/${Date.now()}-${rand}.${ext}`;
      const urlStr = `${baseUrl}/media/${pathStr}`;
      const isFinal = (isFinalField === 'true');
      state.uploads.push({ projectId, type: kind, path: pathStr, url: urlStr, isFinal });
      return sendJson(res, 200, { kind, path: pathStr, url: urlStr, isFinal });
    }
    // We can extend with uploads later as needed.
    notFound(res);
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));
  return { baseUrl, calls, state, close: async () => new Promise((r) => server.close(() => r())) };
}
