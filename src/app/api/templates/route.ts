import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { withApiError } from '@/server/errors';
import { ok } from '@/server/http';
import { authenticateApiRequest } from '@/server/api-user';
import { normalizeTemplateCustomData } from '@/shared/templates/custom-data';

export const GET = withApiError(async function GET(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  const userId = auth?.userId;
  const isAdmin = !!(auth?.sessionUser?.isAdmin);
  const url = new URL(req.url);
  const onlyPublic = url.searchParams.get('onlyPublic') === '1' || url.searchParams.get('public') === '1';
  const mine = url.searchParams.get('mine') === '1';
  const all = url.searchParams.get('all') === '1';

  const where = (() => {
    if (onlyPublic) return { isPublic: true };
    if (mine) return userId ? { ownerId: userId } : { isPublic: true };
    if (all && isAdmin) return {};
    // Default safe behavior: public OR owned by current user
    return userId ? { OR: [{ isPublic: true }, { ownerId: userId }] } : { isPublic: true };
  })();

  const items = await prisma.template.findMany({
    where,
    orderBy: [
      { weight: 'desc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      title: true,
      description: true,
      previewImageUrl: true,
      previewVideoUrl: true,
      weight: true,
      isPublic: true,
      createdAt: true,
      updatedAt: true,
      customData: true,
      captionsStyle: {
        select: { id: true, title: true },
      },
      overlay: {
        select: { id: true, title: true },
      },
      artStyle: {
        select: { id: true, title: true },
      },
      voice: {
        select: {
          id: true,
          title: true,
          description: true,
          externalId: true,
        },
      },
    },
  });
  return ok(items.map((item) => ({
    ...item,
    customData: normalizeTemplateCustomData(item.customData),
  })));
}, 'Failed to list templates');
