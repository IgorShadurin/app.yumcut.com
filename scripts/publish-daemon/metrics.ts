import { logger } from './logger';

type Outcome = 'success' | 'failure';

const metricsState = {
  successCount: 0,
  failureCount: 0,
  totalDurationMs: 0,
};

function logSnapshot(outcome: Outcome, durationMs: number) {
  const processed = metricsState.successCount + metricsState.failureCount;
  const avgDuration = processed > 0 ? Math.round(metricsState.totalDurationMs / processed) : 0;
  logger.info('Publish daemon metrics', {
    outcome,
    lastDurationMs: durationMs,
    successCount: metricsState.successCount,
    failureCount: metricsState.failureCount,
    avgDurationMs: avgDuration,
  });
}

export function recordPublishSuccess(durationMs: number) {
  metricsState.successCount += 1;
  metricsState.totalDurationMs += durationMs;
  logSnapshot('success', durationMs);
}

export function recordPublishFailure(durationMs: number) {
  metricsState.failureCount += 1;
  metricsState.totalDurationMs += durationMs;
  logSnapshot('failure', durationMs);
}

export function getPublishMetricsSnapshot() {
  const processed = metricsState.successCount + metricsState.failureCount;
  const avgDuration = processed > 0 ? Math.round(metricsState.totalDurationMs / processed) : 0;
  return {
    successCount: metricsState.successCount,
    failureCount: metricsState.failureCount,
    avgDurationMs: avgDuration,
  };
}
