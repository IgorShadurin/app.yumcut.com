#!/usr/bin/env tsx
import { loadConfig } from './helpers/config';

async function main() {
  const cfg = loadConfig();
  const ttlMinutes = Number(process.env.CLEANUP_TTL_MINUTES || '15');
  const limit = Number(process.env.CLEANUP_LIMIT || '200');
  const dryRun = (process.env.CLEANUP_DRY_RUN || '').toLowerCase() === 'true';
  const projectId = process.env.CLEANUP_PROJECT_ID || undefined;
  const includeQueued = (process.env.CLEANUP_INCLUDE_QUEUED || '').toLowerCase() === 'true';

  const url = new URL('/api/daemon/jobs/sweep-stale', cfg.apiBaseUrl).toString();
  const body = { ttlMinutes, limit, dryRun, includeQueued, ...(projectId ? { projectId } : {}) } as any;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'x-daemon-password': cfg.apiPassword,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Sweep failed', res.status, res.statusText, text);
    process.exit(2);
  }
  try {
    const json = JSON.parse(text);
    console.log('[sweep-stale] done', JSON.stringify({
      apiBaseUrl: cfg.apiBaseUrl,
      cutoff: json.cutoff,
      count: json.count,
      updated: json.updated?.length || 0,
      dryRun,
      projectId: projectId || null,
      includeQueued,
    }, null, 2));
  } catch {
    console.log(text);
  }
}

void main().catch((err) => {
  console.error('Sweep crashed:', err?.message || String(err));
  process.exit(1);
});
