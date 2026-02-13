import { NextRequest } from 'next/server';
import { withApiError } from '@/server/errors';
import { ok, unauthorized } from '@/server/http';
import { assertDaemonAuth } from '@/server/auth';
import { claimPublishTasks, claimCleanupTasks } from '@/server/publishing/tasks';

function parseLimit(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('limit');
  const value = raw ? Number(raw) : NaN;
  if (!Number.isFinite(value)) return 5;
  return Math.min(Math.max(Math.floor(value), 1), 20);
}

export const GET = withApiError(async function GET(req: NextRequest) {
  if (!(await assertDaemonAuth(req))) return unauthorized('Daemon credentials required');
  const limit = parseLimit(req);
  const status = req.nextUrl.searchParams.get('status') === 'cleanup' ? 'cleanup' : 'pending';
  const tasks = status === 'cleanup' ? await claimCleanupTasks(limit) : await claimPublishTasks(limit);
  return ok({
    tasks: tasks.map((task) => ({
      id: task.id,
      userId: task.userId,
      projectId: task.projectId,
      languageCode: task.languageCode,
      channelId: task.channelId,
      platform: task.platform,
      providerTaskId: (task as any).providerTaskId ?? null,
      videoUrl: task.videoUrl,
      publishAt: task.publishAt.toISOString(),
      title: task.title,
      description: task.description,
      status: task.status,
      createdAt: task.createdAt.toISOString(),
      channel: {
        id: task.channel.id,
        provider: task.channel.provider,
        channelId: task.channel.channelId,
        displayName: task.channel.displayName,
        handle: task.channel.handle,
        refreshToken: task.channel.refreshToken,
        accessToken: task.channel.accessToken,
        tokenExpiresAt: task.channel.tokenExpiresAt ? task.channel.tokenExpiresAt.toISOString() : null,
        scopes: task.channel.scopes,
        metadata: task.channel.metadata,
      },
    })),
  });
}, 'Failed to fetch publish tasks');
