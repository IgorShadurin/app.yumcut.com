import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

export type PublishDaemonConfig = {
  apiBaseUrl: string;
  apiPassword: string;
  daemonId: string;
  pollIntervalMs: number;
  batchSize: number;
  requestTimeoutMs: number;
  allowedMediaHosts: string[];
};

const RawSchema = z.object({
  PUBLISH_DAEMON_API_BASE_URL: z.string().url().default('http://localhost:3000'),
  PUBLISH_DAEMON_ID: z.string().min(1, 'PUBLISH_DAEMON_ID is required for the publish daemon').default('publish-daemon'),
  DAEMON_API_PASSWORD: z.string().min(1, 'DAEMON_API_PASSWORD is required for the publish daemon'),
  PUBLISH_DAEMON_POLL_INTERVAL_MS: z.string().optional(),
  PUBLISH_DAEMON_BATCH_SIZE: z.string().optional(),
  PUBLISH_DAEMON_REQUEST_TIMEOUT_MS: z.string().optional(),
  PUBLISH_DAEMON_ALLOWED_MEDIA_HOSTS: z.string().optional(),
});

let envLoaded = false;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function ensureEnvLoaded() {
  if (envLoaded) return;
  const explicit = process.env.PUBLISH_DAEMON_ENV_FILE;
  const candidate = explicit
    ? path.resolve(process.cwd(), explicit)
    : path.resolve(process.cwd(), '.publish.env');
  if (fs.existsSync(candidate)) {
    loadEnv({ path: candidate, override: false });
  } else {
    loadEnv();
  }
  envLoaded = true;
}

function normalizeApiBaseUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol === 'https:') {
    return parsed.toString();
  }
  if (parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname)) {
    return parsed.toString();
  }
  throw new Error('PUBLISH_DAEMON_API_BASE_URL must use https unless it targets localhost/127.0.0.1/::1.');
}

function parseAllowedHosts(value: string | undefined) {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function readInt(value: string | undefined, fallback: number, options?: { min?: number; max?: number }) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const min = options?.min ?? 1;
  const max = options?.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

export function loadPublishDaemonConfig(): PublishDaemonConfig {
  ensureEnvLoaded();
  const parsed = RawSchema.safeParse(process.env);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    throw new Error(`Invalid publish daemon configuration: ${JSON.stringify(flat.fieldErrors)}`);
  }
  const raw = parsed.data;
  return {
    apiBaseUrl: normalizeApiBaseUrl(raw.PUBLISH_DAEMON_API_BASE_URL),
    apiPassword: raw.DAEMON_API_PASSWORD,
    daemonId: raw.PUBLISH_DAEMON_ID,
    pollIntervalMs: readInt(raw.PUBLISH_DAEMON_POLL_INTERVAL_MS, 1000, { min: 250, max: 10000 }),
    batchSize: readInt(raw.PUBLISH_DAEMON_BATCH_SIZE, 3, { min: 1, max: 10 }),
    requestTimeoutMs: readInt(raw.PUBLISH_DAEMON_REQUEST_TIMEOUT_MS, 15000, { min: 1000, max: 60000 }),
    allowedMediaHosts: parseAllowedHosts(raw.PUBLISH_DAEMON_ALLOWED_MEDIA_HOSTS),
  };
}

export function __resetPublishDaemonConfigForTests() {
  envLoaded = false;
}
