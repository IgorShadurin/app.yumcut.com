import { prisma } from '@/server/db';
import { addUserToEmailContactsInBackground } from '@/server/emails/contacts';

export async function reactivateDeletedUser(userId: string): Promise<boolean> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { deleted: true, email: true, name: true, isGuest: true },
  });
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
  addUserToEmailContactsInBackground({
    userId,
    email: existing.email,
    name: existing.name,
    isGuest: existing.isGuest,
  }, 'account-reactivated');
  return true;
}
