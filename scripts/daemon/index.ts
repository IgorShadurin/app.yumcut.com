#!/usr/bin/env node
import { loadConfig } from './helpers/config';
import type { DaemonConfig } from './helpers/config';
import { log } from './helpers/logger';
import { fetchEligibleProjects, setStatus, setJobStatus, verifyServicesAccess } from './helpers/db';
import { ensureAssetsAvailable } from './helpers/assets';
import { executeJob } from './helpers/executor';
import { claimNextJobs, ensureJobsForProjects } from './helpers/jobs';
import { isVerboseScheduler } from './helpers/scheduler-flags';
import { ProjectStatus } from '@/shared/constants/status';
import { ensureFfmpegVersion } from './helpers/ffmpeg';

type ConfigEntry = { key: string; value: string | number; description: string };

let cfg: DaemonConfig;
let runtimeConfiguration: ConfigEntry[] = [];
try {
  cfg = loadConfig();
  runtimeConfiguration = [
    {
      key: 'DAEMON_ID',
      value: cfg.daemonId,
      description: 'Static identifier for this daemon instance.',
    },
    {
      key: 'DAEMON_API_BASE_URL',
      value: cfg.apiBaseUrl,
      description: 'Base URL for the app API that accepts daemon requests.',
    },
    {
      key: 'DAEMON_STORAGE_BASE_URL',
      value: cfg.storageBaseUrl,
      description: 'Base URL for the storage service that persists media uploads.',
    },
    {
      key: 'DAEMON_API_PASSWORD',
      value: '[redacted]',
      description: 'Shared secret sent with each daemon API request for authentication.',
    },
    {
      key: 'DAEMON_INTERVAL_MS',
      value: cfg.intervalMs,
      description: 'Delay in milliseconds between scheduler ticks when searching for work.',
    },
    {
      key: 'DAEMON_MAX_CONCURRENCY',
      value: cfg.maxConcurrency,
      description: 'Maximum number of projects processed in parallel to avoid overloading the system.',
    },
    {
      key: 'DAEMON_TASK_TIMEOUT_SECONDS',
      value: Math.round(cfg.taskTimeoutMs / 1000),
      description: 'Maximum seconds an in-flight task can run before being marked as timed out.',
    },
    {
      key: 'DAEMON_REQUEST_TIMEOUT_MS',
      value: cfg.requestTimeoutMs,
      description: 'Abort daemon HTTP requests if the app API does not respond within this window.',
    },
    {
      key: 'DAEMON_HEALTH_PATH',
      value: cfg.healthPath,
      description: 'Relative endpoint checked on boot to confirm the app API is reachable.',
    },
    {
      key: 'DAEMON_STORAGE_HEALTH_PATH',
      value: cfg.storageHealthPath,
      description: 'Relative endpoint checked on boot to confirm the storage API is reachable.',
    },
    {
      key: 'DAEMON_SCRIPT_WORKSPACE',
      value: cfg.scriptWorkspace,
      description: 'Absolute path where the prompt-to-text scripts are executed.',
    },
    {
      key: 'DAEMON_SCRIPT_WORKSPACE_V2',
      value: cfg.scriptWorkspaceV2,
      description: 'Workspace for the shorts metadata scripts (v2 pipeline).',
    },
    {
      key: 'DAEMON_PROJECTS_WORKSPACE',
      value: cfg.projectsWorkspace,
      description: 'Root directory where the daemon stores per-project artifacts.',
    },
    {
      key: 'DAEMON_AUDIO_DEFAULT_VOICE',
      value: cfg.audioDefaultVoice,
      description: 'Fallback Gemini voice used when no project-specific voice is provided.',
    },
    {
      key: 'DAEMON_SCRIPT_MODE',
      value: cfg.scriptMode,
      description: 'Speed profile for transcript blocks + image generation (fast | normal).',
    },
  ];
} catch (err: any) {
  log.error('Failed to load daemon configuration', { error: err?.message || String(err) });
  process.exit(1);
}
let interval: NodeJS.Timeout | null = null;

// Track projects in flight to limit concurrency
const inFlight = new Map<string, { startedAt: number; timer: NodeJS.Timeout; jobId: string; type: string }>();

function makeUrl(base: string, path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, base).toString();
}

async function startTask(job: { id: string; projectId: string; type: string; payload: Record<string, unknown> | null }) {
  if (inFlight.has(job.projectId)) return;
  const startedAt = Date.now();
  const reason = typeof job.payload?.reason === 'string' ? job.payload.reason : undefined;
  const requestText = typeof job.payload?.requestText === 'string' ? job.payload.requestText : undefined;
  const creationGuidanceEnabled = job.payload?.scriptCreationGuidanceEnabled === true;
  const avoidanceGuidanceEnabled = job.payload?.scriptAvoidanceGuidanceEnabled === true;
  const creationGuidanceValue = creationGuidanceEnabled && typeof job.payload?.scriptCreationGuidance === 'string'
    ? job.payload.scriptCreationGuidance
    : '';
  const avoidanceGuidanceValue = avoidanceGuidanceEnabled && typeof job.payload?.scriptAvoidanceGuidance === 'string'
    ? job.payload.scriptAvoidanceGuidance
    : '';
  log.info('Start task', {
    projectId: job.projectId,
    type: job.type,
    reason,
    requestPreview: requestText ? requestText.slice(0, 160) : undefined,
    scriptCreationGuidanceEnabled: creationGuidanceEnabled,
    scriptCreationGuidancePreview: creationGuidanceValue ? creationGuidanceValue.slice(0, 200) : undefined,
    scriptAvoidanceGuidanceEnabled: avoidanceGuidanceEnabled,
    scriptAvoidanceGuidancePreview: avoidanceGuidanceValue ? avoidanceGuidanceValue.slice(0, 200) : undefined,
  });
  // Timeout watchdog
  const timer = setTimeout(async () => {
    if (inFlight.has(job.projectId)) {
      log.error('Task timeout', { projectId: job.projectId, timeoutMs: cfg.taskTimeoutMs });
      try { await setStatus(job.projectId, ProjectStatus.Error, 'Task timeout'); } catch {}
      try { await setJobStatus(job.id, 'failed'); } catch {}
    }
  }, cfg.taskTimeoutMs);
  inFlight.set(job.projectId, { startedAt, timer, jobId: job.id, type: job.type });

  try {
    const ok = await executeJob(job);
    await setJobStatus(job.id, ok ? 'done' : 'failed');
  } catch (e: any) {
    log.error('Unhandled task error', { projectId: job.projectId, error: e?.message || String(e) });
    try { await setJobStatus(job.id, 'failed'); } catch {}
  } finally {
    clearTimeout(timer);
    inFlight.delete(job.projectId);
  }
}

async function tick() {
  const capacity = cfg.maxConcurrency - inFlight.size;
  // log.info('Scheduler tick', { capacity, inFlight: inFlight.size });
  try {
    if (capacity <= 0) return;
    const candidates = await fetchEligibleProjects(capacity);
    if (isVerboseScheduler()) {
      log.info('Scheduler tick snapshot', { capacity, eligibleCount: candidates.length, inFlight: inFlight.size });
    }
    await ensureJobsForProjects(candidates);
    const jobs = await claimNextJobs(capacity);
    if (isVerboseScheduler()) {
      log.info('Scheduler claimed jobs', { count: jobs.length });
    }
    for (const j of jobs) {
      if (inFlight.has(j.projectId)) continue;
      void startTask(j);
    }
  } catch (e: any) {
    log.error('Tick error', { error: e?.message || String(e) });
  }
}

// Main loop
async function start() {
  log.info('Daemon performing startup checks');
  await ensureFfmpegVersion();
  ensureAssetsAvailable();
  await verifyServicesAccess();
  log.info('Daemon startup checks passed');
  log.info('Daemon starting', { configuration: runtimeConfiguration });
  interval = setInterval(tick, cfg.intervalMs);
  // Kick off immediately instead of waiting for first interval
  void tick();
  // Heartbeat feature removed by request; cleanup script is used instead.
}

void start().catch((err: any) => {
  log.error('Daemon startup failed', { error: err?.message || String(err) });
  process.exit(1);
});

async function shutdown() {
  log.info('Shutting down...');
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  try {
    // Give in-flight tasks a moment to settle
    const waitUntil = Date.now() + 1000;
    while (inFlight.size > 0 && Date.now() < waitUntil) {
      await new Promise((r) => setTimeout(r, 50));
    }
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
