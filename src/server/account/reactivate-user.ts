import { prisma } from '@/server/db';

export async function reactivateDeletedUser(userId: string): Promise<boolean> {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { deleted: true } });
  if (!existing?.deleted) {
    return false;
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      deleted: false,
      deletedAt: null,
    },
  });
  return true;
}
