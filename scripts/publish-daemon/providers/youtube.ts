import { OAuth2Client } from 'google-auth-library';
import { logger } from '../logger';
import type { PublishTaskPayload } from '../types';
import { ProviderError } from './errors';
import { loadPublishDaemonConfig } from '../config';

export type ProviderScheduleResult = {
  providerTaskId?: string | null;
};

const RESUMABLE_ENDPOINT = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const QUOTA_REASONS = new Set(['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded']);
const RATE_LIMIT_REASONS = new Set(['userRateLimitExceeded', 'tooManyRecentUploads']);
const TRANSIENT_REASONS = new Set(['backendError', 'internalError', 'processingFailure']);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

type YoutubeStage = 'download' | 'init' | 'upload' | 'cleanup';

function requireEnv(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} for YouTube provider`);
  }
  return value;
}

function getAllowedMediaHosts() {
  const hosts = loadPublishDaemonConfig().allowedMediaHosts;
  if (!hosts || hosts.length === 0) {
    throw new Error('PUBLISH_DAEMON_ALLOWED_MEDIA_HOSTS must list the storage hosts the daemon is permitted to download from.');
  }
  return hosts;
}

function ensureAllowedVideoUrl(input: string) {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new ProviderError('Invalid video URL', {
      code: 'storage_download_failed',
      retryable: false,
      details: { stage: 'download' },
    });
  }
  if (parsed.protocol !== 'https:') {
    throw new ProviderError('Video downloads must use HTTPS', {
      code: 'storage_download_failed',
      retryable: false,
      details: { stage: 'download', protocol: parsed.protocol },
    });
  }
  const allowedHosts = getAllowedMediaHosts();
  const hostname = parsed.hostname.toLowerCase();
  if (!allowedHosts.includes(hostname)) {
    throw new ProviderError('Video host is not allowed', {
      code: 'storage_download_failed',
      retryable: false,
      details: { stage: 'download', host: hostname },
    });
  }
  return parsed.toString();
}

async function refreshAccessToken(refreshToken: string) {
  const client = new OAuth2Client(requireEnv('YOUTUBE_CLIENT_ID'), requireEnv('YOUTUBE_CLIENT_SECRET'));
  client.setCredentials({ refresh_token: refreshToken });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Failed to refresh YouTube access token');
  return token;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(stage: YoutubeStage, action: () => Promise<T>): Promise<T> {
  let attempt = 0;
  // MAX_ATTEMPTS represents the total attempts (initial + retries)
  while (attempt < MAX_ATTEMPTS) {
    try {
      return await action();
    } catch (err) {
      const providerErr = err instanceof ProviderError ? err : null;
      const shouldRetry = providerErr?.retryable ?? false;
      if (!shouldRetry || attempt === MAX_ATTEMPTS - 1) {
        throw err;
      }
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
      logger.warn('Retrying YouTube request', {
        stage,
        attempt: attempt + 1,
        delayMs,
        code: providerErr?.code,
        message: providerErr?.message,
      });
      await sleep(delayMs);
    }
    attempt += 1;
  }
  throw new Error(`Exceeded retry attempts for stage ${stage}`);
}

async function safeFetch(stage: YoutubeStage, input: RequestInfo | URL, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (err) {
    throw new ProviderError(`Network error during ${stage}`, {
      code: 'network_error',
      retryable: true,
      details: {
        stage,
        cause: err instanceof Error ? err.message : String(err),
      },
      cause: err,
    });
  }
}

type YoutubeErrorPayload = {
  error?: {
    message?: string;
    errors?: Array<{ reason?: string; message?: string; domain?: string }>;
  };
};

function classifyYoutubeError(status: number, reason: string | null) {
  if (reason && QUOTA_REASONS.has(reason)) {
    return { code: 'quota_exceeded' as const, retryable: false };
  }
  if (reason && RATE_LIMIT_REASONS.has(reason)) {
    return { code: 'rate_limited' as const, retryable: true };
  }
  if ((reason && TRANSIENT_REASONS.has(reason)) || RETRYABLE_STATUS.has(status)) {
    return { code: 'transient_http_error' as const, retryable: true };
  }
  return { code: 'youtube_http_error' as const, retryable: false };
}

async function buildYoutubeError(stage: YoutubeStage, res: Response) {
  const text = await res.text().catch(() => '');
  let payload: YoutubeErrorPayload | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  const reason = payload?.error?.errors?.[0]?.reason ?? null;
  const message = payload?.error?.message || text || `YouTube API error (${res.status})`;
  const { code, retryable } = classifyYoutubeError(res.status, reason);
  return new ProviderError(message, {
    code,
    retryable,
    details: {
      stage,
      status: res.status,
      reason,
    },
  });
}

async function downloadVideo(videoUrl: string) {
  return withRetry('download', async () => {
    const sanitizedUrl = ensureAllowedVideoUrl(videoUrl);
    const res = await safeFetch('download', sanitizedUrl);
    if (!res.ok) {
      throw new ProviderError(`Failed to download video (${res.status})`, {
        code: 'storage_download_failed',
        retryable: res.status >= 500 || res.status === 429,
        details: {
          stage: 'download',
          status: res.status,
        },
      });
    }
    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  });
}

function buildMetadata(task: PublishTaskPayload) {
  const publishAt = new Date(task.publishAt);
  const status: Record<string, any> = {
    privacyStatus: publishAt.getTime() > Date.now() ? 'private' : 'public',
    selfDeclaredMadeForKids: false,
  };
  if (publishAt.getTime() > Date.now()) {
    status.publishAt = publishAt.toISOString();
  }
  return {
    snippet: {
      title: task.title || `YumCut ${task.projectId} ${task.languageCode.toUpperCase()}`,
      description: task.description || 'Uploaded via YumCut auto scheduler.',
      defaultLanguage: task.languageCode,
      tags: ['YumCut'],
      categoryId: '22',
    },
    status,
  };
}

async function startResumableSession(accessToken: string, metadata: Record<string, unknown>, videoLength: number) {
  return withRetry('init', async () => {
    const res = await safeFetch('init', RESUMABLE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(videoLength),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    });
    if (!res.ok) {
      throw await buildYoutubeError('init', res);
    }
    const uploadUrl = res.headers.get('location') || res.headers.get('Location');
    if (!uploadUrl) {
      throw new ProviderError('YouTube did not return an upload URL', {
        code: 'youtube_http_error',
        retryable: true,
        details: { stage: 'init' },
      });
    }
    return uploadUrl;
  });
}

async function uploadVideoBuffer(uploadUrl: string, accessToken: string, videoBuffer: Uint8Array) {
  const res = await withRetry('upload', async () => {
    const uploadRes = await safeFetch('upload', uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoBuffer.byteLength),
      },
      body: videoBuffer as unknown as BodyInit,
    });
    if (!uploadRes.ok) {
      throw await buildYoutubeError('upload', uploadRes);
    }
    return uploadRes;
  });
  return res;
}

export async function scheduleYoutubeShort(task: PublishTaskPayload): Promise<ProviderScheduleResult> {
  if (!task.channel.refreshToken) {
    throw new Error('Channel is missing a refresh token');
  }
  logger.info('Scheduling YouTube upload', {
    taskId: task.id,
    channelId: task.channel.channelId,
    publishAt: task.publishAt,
  });
  const accessToken = await refreshAccessToken(task.channel.refreshToken);
  const videoBuffer = await downloadVideo(task.videoUrl);
  const metadata = buildMetadata(task);
  const uploadUrl = await startResumableSession(accessToken, metadata, videoBuffer.byteLength);
  const uploadRes = await uploadVideoBuffer(uploadUrl, accessToken, videoBuffer);
  const uploaded = await uploadRes.json().catch(() => ({ id: null }));
  const videoId = uploaded?.id || null;
  logger.info('YouTube upload complete', { taskId: task.id, videoId });
  return { providerTaskId: videoId };
}

export async function cancelYoutubeShort(task: PublishTaskPayload): Promise<void> {
  if (!task.channel.refreshToken || !task.providerTaskId) {
    logger.warn('Skip cleanup, missing refresh token or video id', { taskId: task.id });
    return;
  }
  const accessToken = await refreshAccessToken(task.channel.refreshToken);
  const response = await safeFetch('cleanup', `https://www.googleapis.com/youtube/v3/videos?id=${task.providerTaskId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw await buildYoutubeError('cleanup', response);
  }
  logger.info('Cancelled scheduled YouTube upload', {
    taskId: task.id,
    videoId: task.providerTaskId,
  });
}
