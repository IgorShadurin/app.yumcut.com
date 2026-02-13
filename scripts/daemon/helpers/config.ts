import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

export type ScriptMode = 'fast' | 'normal';

export type DaemonConfig = {
  daemonId: string;
  intervalMs: number;
  maxConcurrency: number;
  taskTimeoutMs: number;
  apiBaseUrl: string;
  apiPassword: string;
  requestTimeoutMs: number;
  healthPath: string;
  storageBaseUrl: string;
  storageHealthPath: string;
  scriptWorkspace: string;
  scriptWorkspaceV2: string;
  scriptCaptionWorkspace: string;
  projectsWorkspace: string;
  audioDefaultVoice: string;
  audioDefaultStyle: string | null;
  captionsRenderer: 'python' | 'legacy';
  scriptMode: ScriptMode;
};

const RawEnvSchema = z.object({
  DAEMON_ID: z.string().min(1, 'Daemon id is required'),
  DAEMON_API_BASE_URL: z.string().url(),
  DAEMON_API_PASSWORD: z.string().min(1),
  DAEMON_STORAGE_BASE_URL: z.string().url(),
  DAEMON_STORAGE_HEALTH_PATH: z.string().optional(),
  DAEMON_INTERVAL_MS: z.string().optional(),
  DAEMON_MAX_CONCURRENCY: z.string().optional(),
  DAEMON_TASK_TIMEOUT_SECONDS: z.string().optional(),
  DAEMON_REQUEST_TIMEOUT_MS: z.string().optional(),
  DAEMON_HEALTH_PATH: z.string().optional(),
  DAEMON_SCRIPT_WORKSPACE: z.string().min(1, 'Script workspace path is required'),
  DAEMON_SCRIPT_WORKSPACE_V2: z.string().min(1, 'Script workspace v2 path is required'),
  DAEMON_SCRIPT_CAPTION: z.string().min(1, 'Caption renderer workspace path is required'),
  DAEMON_PROJECTS_WORKSPACE: z.string().min(1, 'Projects workspace path is required'),
  DAEMON_AUDIO_DEFAULT_VOICE: z.string().optional(),
  DAEMON_AUDIO_DEFAULT_STYLE: z.string().optional(),
  DAEMON_CAPTIONS_RENDERER: z.string().optional(),
  DAEMON_SCRIPT_MODE: z.string().optional(),
});

let cachedConfig: DaemonConfig | null = null;
let envLoaded = false;

function ensureEnvLoaded() {
  if (envLoaded) return;
  const explicitPath = process.env.DAEMON_ENV_FILE;
  const envPath = explicitPath ? path.resolve(process.cwd(), explicitPath) : path.resolve(process.cwd(), '.daemon.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing daemon env file at ${envPath}`);
  }
  loadEnv({ path: envPath, override: true });
  envLoaded = true;
}

function toInt(value: string | undefined, fallback: number, min = 1) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.floor(parsed);
}

function toScriptMode(value: string | undefined): ScriptMode {
  if (!value) return 'normal';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'normal') return 'normal';
  if (normalized === 'fast') return 'fast';
  return 'fast';
}

export function loadConfig(): DaemonConfig {
  if (cachedConfig) return cachedConfig;
  ensureEnvLoaded();
  const parsed = RawEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const messages = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid daemon configuration: ${JSON.stringify(messages)}`);
  }
  const base = parsed.data;
  const runtimeDaemonId = typeof process.env.DAEMON_INSTANCE_ID === 'string' ? process.env.DAEMON_INSTANCE_ID.trim() : '';
  const daemonId = (runtimeDaemonId && runtimeDaemonId.length > 0 ? runtimeDaemonId : base.DAEMON_ID).trim();
  const intervalMs = toInt(base.DAEMON_INTERVAL_MS, 1000, 50);
  const maxConcurrency = toInt(base.DAEMON_MAX_CONCURRENCY, 2, 1);
  const timeoutSeconds = toInt(base.DAEMON_TASK_TIMEOUT_SECONDS, 3600, 1);
  const timeoutMs = timeoutSeconds * 1000;
  const requestTimeoutMs = toInt(base.DAEMON_REQUEST_TIMEOUT_MS, 15000, 1000);
  const rendererRaw = (base.DAEMON_CAPTIONS_RENDERER || '').trim().toLowerCase();
  const captionsRenderer: 'python' | 'legacy' = rendererRaw === 'legacy' ? 'legacy' : 'python';
  const scriptMode = toScriptMode(base.DAEMON_SCRIPT_MODE);
  const cfg: DaemonConfig = {
    daemonId,
    intervalMs,
    maxConcurrency,
    taskTimeoutMs: timeoutMs,
    apiBaseUrl: base.DAEMON_API_BASE_URL,
    apiPassword: base.DAEMON_API_PASSWORD,
    requestTimeoutMs,
    healthPath: base.DAEMON_HEALTH_PATH && base.DAEMON_HEALTH_PATH.trim() ? base.DAEMON_HEALTH_PATH : '/api/daemon/health',
    storageBaseUrl: base.DAEMON_STORAGE_BASE_URL,
    storageHealthPath:
      base.DAEMON_STORAGE_HEALTH_PATH && base.DAEMON_STORAGE_HEALTH_PATH.trim()
        ? base.DAEMON_STORAGE_HEALTH_PATH
        : '/api/storage/health',
    scriptWorkspace: resolveWorkspace(base.DAEMON_SCRIPT_WORKSPACE),
    scriptWorkspaceV2: resolveWorkspace(base.DAEMON_SCRIPT_WORKSPACE_V2),
    scriptCaptionWorkspace: resolveWorkspace(base.DAEMON_SCRIPT_CAPTION),
    projectsWorkspace: resolveWorkspace(base.DAEMON_PROJECTS_WORKSPACE, true),
    audioDefaultVoice: (base.DAEMON_AUDIO_DEFAULT_VOICE && base.DAEMON_AUDIO_DEFAULT_VOICE.trim()) || 'Kore',
    audioDefaultStyle:
      base.DAEMON_AUDIO_DEFAULT_STYLE && base.DAEMON_AUDIO_DEFAULT_STYLE.trim()
        ? base.DAEMON_AUDIO_DEFAULT_STYLE.trim()
        : null,
    captionsRenderer,
    scriptMode,
  };
  cachedConfig = cfg;
  return cfg;
}

function resolveWorkspace(rawPath: string, createIfMissing = false) {
  const trimmed = rawPath.trim();
  const workspace = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(process.cwd(), trimmed);
  try {
    const stats = fs.statSync(workspace);
    if (!stats.isDirectory()) {
      throw new Error(`Workspace ${workspace} is not a directory`);
    }
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      if (createIfMissing) {
        fs.mkdirSync(workspace, { recursive: true });
        return workspace;
      } else {
        throw new Error(`Workspace not found at ${workspace}`);
      }
    }
    throw err;
  }
  return workspace;
}

export function __resetDaemonConfigForTests(): void {
  cachedConfig = null;
  envLoaded = false;
}
