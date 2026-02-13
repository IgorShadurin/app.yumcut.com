import { logger } from './logger';
import { getProvider, getCleanupProvider } from './providers';
import type { SchedulerApiClient } from './client';
import type { PublishTaskPayload } from './types';
import { recordPublishFailure, recordPublishSuccess } from './metrics';
import { isProviderError } from './providers/errors';

export function formatError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function processTask(client: SchedulerApiClient, task: PublishTaskPayload) {
  const startedAt = Date.now();
  logger.info('Processing publish task', {
    taskId: task.id,
    provider: task.platform,
    channelId: task.channel.channelId,
    publishAt: task.publishAt,
  });
  try {
    const provider = getProvider(task.platform);
    const result = await provider(task);
    try {
      await client.updateTask(task.id, {
        status: 'scheduled',
        providerTaskId: result?.providerTaskId ?? null,
      });
    } catch (err) {
      const updateError = formatError(err);
      logger.error('Failed to mark task as scheduled', { taskId: task.id, error: updateError });
      try {
        await client.updateTask(task.id, {
          status: 'retry',
          error: `Scheduling update failed: ${updateError}`,
        });
      } catch (secondary) {
        logger.error('Failed to mark task for retry', { taskId: task.id, error: formatError(secondary) });
      }
      return;
    }
    const elapsedMs = Date.now() - startedAt;
    logger.info('Task scheduled', {
      taskId: task.id,
      providerTaskId: result?.providerTaskId ?? null,
      channelId: task.channel.channelId,
      elapsedMs,
    });
    recordPublishSuccess(elapsedMs);
  } catch (err) {
    const errorMessage = formatError(err);
    const elapsedMs = Date.now() - startedAt;
    const providerErr = isProviderError(err) ? err : null;
    logger.error('Failed to schedule task', {
      taskId: task.id,
      channelId: task.channel.channelId,
      elapsedMs,
      error: errorMessage,
      code: providerErr?.code,
    });
    recordPublishFailure(elapsedMs);
    const providerResponse = providerErr
      ? {
          errorCode: providerErr.code,
          retryable: providerErr.retryable,
          ...(providerErr.details ?? {}),
        }
      : undefined;
    await client.updateTask(task.id, {
      status: providerErr?.retryable ? 'retry' : 'failed',
      error: errorMessage,
      ...(providerResponse ? { providerResponse } : {}),
    });
  }
}

async function processCleanupTask(client: SchedulerApiClient, task: PublishTaskPayload) {
  const startedAt = Date.now();
  const cancelHandler = getCleanupProvider(task.platform);
  try {
    if (cancelHandler) {
      await cancelHandler(task);
    } else {
      logger.warn('No cleanup handler for provider', { provider: task.platform });
    }
    await client.completeCleanup(task.id, { status: 'done' });
    logger.info('Cleanup completed', { taskId: task.id, channelId: task.channel.channelId, elapsedMs: Date.now() - startedAt });
  } catch (err) {
    const errorMessage = formatError(err);
    logger.error('Cleanup failed', { taskId: task.id, channelId: task.channel.channelId, error: errorMessage });
    await client.completeCleanup(task.id, { status: 'failed', error: errorMessage });
  }
}

export async function runIteration(client: SchedulerApiClient, batchSize: number) {
  const { tasks } = await client.fetchTasks(batchSize, 'pending');
  for (const task of tasks) {
    await processTask(client, task);
  }
  const cleanup = await client.fetchTasks(batchSize, 'cleanup');
  for (const task of cleanup.tasks) {
    await processCleanupTask(client, task);
  }
  return tasks.length + cleanup.tasks.length;
}
