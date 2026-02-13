import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

type MockInstance = ReturnType<typeof vi.fn>;

vi.mock('../../scripts/publish-daemon/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    setCredentials: vi.fn(),
    getAccessToken: vi.fn(async () => ({ token: 'access-token' })),
  })),
}));

import { scheduleYoutubeShort, cancelYoutubeShort } from '../../scripts/publish-daemon/providers/youtube';
import { logger } from '../../scripts/publish-daemon/logger';

const MEDIA_HOST = 'storage.test.local';

const baseTask = {
  id: 'task-1',
  userId: 'user-1',
  projectId: 'project-1',
  languageCode: 'en',
  channelId: 'channel-1',
  platform: 'youtube',
  videoUrl: `https://${MEDIA_HOST}/video.mp4`,
  publishAt: new Date().toISOString(),
  title: 'Title',
  description: null,
  status: 'pending',
  createdAt: new Date().toISOString(),
  channel: {
    id: 'channel-1',
    provider: 'youtube',
    channelId: 'UC123',
    displayName: 'Test Channel',
    handle: '@test',
    refreshToken: 'refresh',
    accessToken: null,
    tokenExpiresAt: null,
    scopes: null,
    metadata: null,
  },
};

describe('scheduleYoutubeShort', () => {
  beforeEach(() => {
    Object.values(logger).forEach((mock) => {
      if (typeof mock === 'function' && 'mockReset' in mock) {
        (mock as MockInstance).mockReset();
      }
    });
    vi.stubGlobal('fetch', vi.fn());
    process.env.YOUTUBE_CLIENT_ID = 'client';
    process.env.YOUTUBE_CLIENT_SECRET = 'secret';
    process.env.PUBLISH_DAEMON_ALLOWED_MEDIA_HOSTS = MEDIA_HOST;
    process.env.DAEMON_API_PASSWORD = 'daemon-secret';
    process.env.PUBLISH_DAEMON_API_BASE_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PUBLISH_DAEMON_ALLOWED_MEDIA_HOSTS;
    delete process.env.DAEMON_API_PASSWORD;
    delete process.env.PUBLISH_DAEMON_API_BASE_URL;
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
    vi.useRealTimers();
  });

  it('logs metadata and returns provider task id', async () => {
    const fetchMock = global.fetch as unknown as MockInstance;
    fetchMock
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'https://upload-session' } })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'video123' }) });
    const result = await scheduleYoutubeShort(baseTask);
    expect(result.providerTaskId).toBe('video123');
    expect(logger.info).toHaveBeenCalledWith('Scheduling YouTube upload', expect.objectContaining({
      taskId: baseTask.id,
      channelId: baseTask.channel.channelId,
      publishAt: baseTask.publishAt,
    }));
  });

  it('throws when upload fails after retries are exhausted', async () => {
    vi.useFakeTimers();
    const fetchMock = global.fetch as unknown as MockInstance;
    const failure = { ok: false, status: 500, text: async () => 'boom' };
    fetchMock
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'https://upload-session' } })
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(failure);
    const promise = scheduleYoutubeShort(baseTask);
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'transient_http_error',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
  });

  it('retries transient upload errors with backoff', async () => {
    vi.useFakeTimers();
    const fetchMock = global.fetch as unknown as MockInstance;
    fetchMock
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'https://upload-session' } })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'video123' }) });
    const promise = scheduleYoutubeShort(baseTask);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;
    expect(result.providerTaskId).toBe('video123');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('exposes quota errors with explicit codes', async () => {
    const fetchMock = global.fetch as unknown as MockInstance;
    fetchMock
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ error: { message: 'quota exceeded', errors: [{ reason: 'quotaExceeded' }] } }),
      });
    await expect(scheduleYoutubeShort(baseTask)).rejects.toMatchObject({
      code: 'quota_exceeded',
      retryable: false,
    });
  });

  it('treats rate limit errors as retryable provider errors', async () => {
    vi.useFakeTimers();
    const fetchMock = global.fetch as unknown as MockInstance;
    const rateLimitResponse = {
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: 'slow down', errors: [{ reason: 'userRateLimitExceeded' }] } }),
    };
    fetchMock
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'https://upload-session' } })
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(rateLimitResponse);

    const promise = scheduleYoutubeShort(baseTask);
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'rate_limited',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
  });

  it('rejects storage URLs that are not on the allowlist', async () => {
    vi.useFakeTimers();
    const fetchMock = global.fetch as unknown as MockInstance;
    fetchMock.mockClear();
    await expect(scheduleYoutubeShort({ ...baseTask, videoUrl: 'https://malicious.example.com/video.mp4' })).rejects.toMatchObject({
      code: 'storage_download_failed',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS storage URLs', async () => {
    vi.useFakeTimers();
    const fetchMock = global.fetch as unknown as MockInstance;
    fetchMock.mockClear();
    await expect(scheduleYoutubeShort({ ...baseTask, videoUrl: `http://${MEDIA_HOST}/video.mp4` })).rejects.toMatchObject({
      code: 'storage_download_failed',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('cancelYoutubeShort', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env.YOUTUBE_CLIENT_ID = 'client';
    process.env.YOUTUBE_CLIENT_SECRET = 'secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips when missing provider video id', async () => {
    await cancelYoutubeShort({ ...baseTask, providerTaskId: null });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('deletes provider video when present', async () => {
    (global.fetch as unknown as MockInstance)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true });
    await cancelYoutubeShort({ ...baseTask, providerTaskId: 'yt123', channel: { ...baseTask.channel, refreshToken: 'refresh' } });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('youtube/v3/videos?id=yt123'), expect.objectContaining({ method: 'DELETE' }));
  });
});
