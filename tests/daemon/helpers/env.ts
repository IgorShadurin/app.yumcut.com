import path from 'path';

type OverrideKeys =
  | 'intervalMs'
  | 'maxConcurrency'
  | 'taskTimeoutSeconds'
  | 'requestTimeoutMs'
  | 'healthPath'
  | 'storageHealthPath'
  | 'scriptWorkspace'
  | 'scriptWorkspaceV2'
  | 'scriptCaptionWorkspace'
  | 'audioDefaultVoice'
  | 'logsSilent'
  | 'scriptMode';

export type BuildDaemonEnvOptions = {
  apiBaseUrl: string;
  storageBaseUrl: string;
  password: string;
  projectsWorkspace: string;
  daemonId?: string;
  overrides?: Partial<Record<OverrideKeys, string | number>>;
  extra?: Record<string, string | number>;
};

const DEFAULT_SCRIPT_WORKSPACE = path.resolve('tests/daemon/dummy-scripts/DAEMON_SCRIPT_WORKSPACE');
const DEFAULT_SCRIPT_WORKSPACE_V2 = path.resolve('tests/daemon/dummy-scripts/DAEMON_SCRIPT_WORKSPACE_V2');
const DEFAULT_SCRIPT_CAPTION_WORKSPACE = path.resolve('tests/daemon/dummy-scripts/DAEMON_SCRIPT_CAPTION');

export function buildDaemonEnvMap(options: BuildDaemonEnvOptions): Record<string, string> {
  const base: Record<string, string> = {
    DAEMON_ID: options.daemonId ?? 'daemon-test',
    DAEMON_API_BASE_URL: options.apiBaseUrl,
    DAEMON_STORAGE_BASE_URL: options.storageBaseUrl,
    DAEMON_API_PASSWORD: options.password,
    DAEMON_INTERVAL_MS: '100',
    DAEMON_MAX_CONCURRENCY: '1',
    DAEMON_TASK_TIMEOUT_SECONDS: '10',
    DAEMON_REQUEST_TIMEOUT_MS: '500',
    DAEMON_HEALTH_PATH: '/api/daemon/health',
    DAEMON_STORAGE_HEALTH_PATH: '/api/storage/health',
    DAEMON_SCRIPT_WORKSPACE: DEFAULT_SCRIPT_WORKSPACE,
    DAEMON_SCRIPT_WORKSPACE_V2: DEFAULT_SCRIPT_WORKSPACE_V2,
    DAEMON_SCRIPT_CAPTION: DEFAULT_SCRIPT_CAPTION_WORKSPACE,
    DAEMON_PROJECTS_WORKSPACE: options.projectsWorkspace,
    DAEMON_AUDIO_DEFAULT_VOICE: 'Kore',
    DAEMON_LOGS_SILENT: '1',
    DAEMON_SCRIPT_MODE: 'fast',
    DAEMON_USE_FAKE_CLI: '1',
    YUMCUT_PROMPT_STUB_DELAY_MS: '1200',
  };

  const overrides = options.overrides ?? {};
  if (overrides.intervalMs !== undefined) base.DAEMON_INTERVAL_MS = String(overrides.intervalMs);
  if (overrides.maxConcurrency !== undefined) base.DAEMON_MAX_CONCURRENCY = String(overrides.maxConcurrency);
  if (overrides.taskTimeoutSeconds !== undefined) base.DAEMON_TASK_TIMEOUT_SECONDS = String(overrides.taskTimeoutSeconds);
  if (overrides.requestTimeoutMs !== undefined) base.DAEMON_REQUEST_TIMEOUT_MS = String(overrides.requestTimeoutMs);
  if (overrides.healthPath !== undefined) base.DAEMON_HEALTH_PATH = String(overrides.healthPath);
  if (overrides.storageHealthPath !== undefined) base.DAEMON_STORAGE_HEALTH_PATH = String(overrides.storageHealthPath);
  if (overrides.scriptWorkspace !== undefined) base.DAEMON_SCRIPT_WORKSPACE = String(overrides.scriptWorkspace);
  if (overrides.scriptWorkspaceV2 !== undefined) base.DAEMON_SCRIPT_WORKSPACE_V2 = String(overrides.scriptWorkspaceV2);
  if (overrides.scriptCaptionWorkspace !== undefined) base.DAEMON_SCRIPT_CAPTION = String(overrides.scriptCaptionWorkspace);
  if (overrides.audioDefaultVoice !== undefined) base.DAEMON_AUDIO_DEFAULT_VOICE = String(overrides.audioDefaultVoice);
  if (overrides.logsSilent !== undefined) base.DAEMON_LOGS_SILENT = String(overrides.logsSilent);
  if (overrides.scriptMode !== undefined) base.DAEMON_SCRIPT_MODE = String(overrides.scriptMode);

  if (options.extra) {
    for (const [key, value] of Object.entries(options.extra)) {
      base[key] = String(value);
    }
  }

  return base;
}

export function buildDaemonEnvLines(options: BuildDaemonEnvOptions): string[] {
  const map = buildDaemonEnvMap(options);
  return Object.entries(map).map(([key, value]) => `${key}=${value}`);
}

export function buildDaemonEnvContent(options: BuildDaemonEnvOptions): string {
  return buildDaemonEnvLines(options).join('\n');
}
