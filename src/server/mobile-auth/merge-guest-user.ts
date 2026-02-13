import { prisma } from '@/server/db';
import { reactivateDeletedUser } from '@/server/account/reactivate-user';

export type GuestMergeResult = {
  userId: string;
  mergedFromGuest: boolean;
};

export async function mergeGuestIntoUser(options: {
  guestUserId: string;
  targetUserId: string;
}): Promise<GuestMergeResult> {
  const { guestUserId, targetUserId } = options;
  if (guestUserId === targetUserId) {
    await prisma.user.update({
      where: { id: guestUserId },
      data: { isGuest: false, guestConvertedAt: new Date() },
    });
    return { userId: guestUserId, mergedFromGuest: true };
  }

  const guest = await prisma.user.findUnique({
    where: { id: guestUserId },
    select: { id: true, deleted: true, isGuest: true, tokenBalance: true },
  });
  if (!guest) {
    throw new Error('Guest user not found');
  }
  if (!guest.isGuest) {
    return { userId: guestUserId, mergedFromGuest: false };
  }

  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetUserId }, select: { id: true, deleted: true, tokenBalance: true } });
    if (!target) {
      throw new Error('Target user not found');
    }
    if (target.deleted) {
      await reactivateDeletedUser(target.id);
    }

    await tx.subscriptionPurchase.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    await tx.tokenTransaction.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    await tx.project.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    await tx.userCharacter.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    await tx.projectGroup.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    await tx.publishChannel.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    await tx.publishChannelLanguage.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    await tx.publishChannelOAuthState.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    await tx.publishTask.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    await tx.telegramAccount.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    await tx.telegramLinkToken.updateMany({ where: { userId: guestUserId }, data: { userId: targetUserId } });
    await tx.mobileSession.deleteMany({ where: { userId: guestUserId } });
    await tx.guestProfile.deleteMany({ where: { userId: guestUserId } });

    const guestSettings = await tx.userSettings.findUnique({ where: { userId: guestUserId } });
    if (guestSettings) {
      const targetSettings = await tx.userSettings.findUnique({ where: { userId: targetUserId } });
      if (!targetSettings) {
        await tx.userSettings.update({ where: { userId: guestUserId }, data: { userId: targetUserId } });
      } else {
        await tx.userSettings.delete({ where: { userId: guestUserId } });
      }
    }

    await tx.user.update({
      where: { id: guestUserId },
      data: {
        deleted: true,
        deletedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: targetUserId },
      data: {
        isGuest: false,
        guestConvertedAt: new Date(),
        tokenBalance: (target.tokenBalance ?? 0) + (guest.tokenBalance ?? 0),
      },
    });
  });

  return { userId: targetUserId, mergedFromGuest: true };
}
