#!/usr/bin/env node
import { loadPublishDaemonConfig } from './config';
import { logger } from './logger';
import { SchedulerApiClient } from './client';
import { formatError, runIteration } from './runner';

let shuttingDown = false;

async function runLoop() {
  const cfg = loadPublishDaemonConfig();
  const client = new SchedulerApiClient(cfg);
  logger.info('Publish daemon starting', {
    apiBaseUrl: cfg.apiBaseUrl,
    daemonId: cfg.daemonId,
    pollIntervalMs: cfg.pollIntervalMs,
    batchSize: cfg.batchSize,
  });
  while (!shuttingDown) {
    const started = Date.now();
    try {
      if (shuttingDown) break;
      await runIteration(client, cfg.batchSize);
    } catch (err) {
      logger.error('Scheduler tick failed', { error: formatError(err) });
    }
    const elapsed = Date.now() - started;
    const waitFor = Math.max(cfg.pollIntervalMs - elapsed, 200);
    await new Promise((resolve) => setTimeout(resolve, waitFor));
  }
  logger.info('Publish daemon stopped');
}

function handleShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down...`);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

runLoop().catch((err) => {
  logger.error('Publish daemon crashed', { error: formatError(err) });
  process.exit(1);
});
