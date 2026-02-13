import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { ok, unauthorized } from '@/server/http';
import { withApiError } from '@/server/errors';
import { getTokenHistory } from '@/server/tokens';

const DEFAULT_PAGE_SIZE = 20;

export const GET = withApiError(async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const searchParams = new URL(req.url).searchParams;
  const pageParam = Number(searchParams.get('page'));
  const pageSizeParam = Number(searchParams.get('pageSize'));
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? Math.floor(pageSizeParam) : DEFAULT_PAGE_SIZE;
  const history = await getTokenHistory({ userId, page, pageSize });
  return ok({
    items: history.items.map((item) => ({
      id: item.id,
      delta: item.delta,
      balanceAfter: item.balanceAfter,
      type: item.type,
      description: item.description,
      initiator: item.initiator,
      metadata: item.metadata,
      createdAt: item.createdAt.toISOString(),
    })),
    total: history.total,
    page: history.page,
    pageSize: history.pageSize,
    totalPages: history.totalPages,
  });
}, 'Failed to load token history');
