import crypto from 'node:crypto';
import { prisma } from '@/server/db';
import { reactivateDeletedUser } from '@/server/account/reactivate-user';
import { logAppleSubscriptionEvent } from '@/server/app-store/subscription-logger';
import { notifyAdminsOfNewUser } from '@/server/telegram';

export type GuestMetadata = {
  deviceId: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
};

export async function getOrCreateGuestUser(metadata: GuestMetadata) {
  const deviceId = normalizeDeviceId(metadata.deviceId);
  const existingProfile = await prisma.guestProfile.findUnique({
    where: { deviceId },
    include: {
      user: {
        select: {
          id: true,
          deleted: true,
          isGuest: true,
        },
      },
    },
  });

  if (existingProfile?.user?.isGuest) {
    if (existingProfile.user.deleted) {
      await reactivateDeletedUser(existingProfile.user.id);
    }

    await prisma.guestProfile.update({
      where: { id: existingProfile.id },
      data: {
        deviceName: metadata.deviceName ?? undefined,
        platform: metadata.platform ?? undefined,
        appVersion: metadata.appVersion ?? undefined,
      },
    });

    const updatedUser = await prisma.user.update({
      where: { id: existingProfile.userId },
      data: {
        guestDeviceId: deviceId,
        isGuest: true,
        deleted: false,
      },
    });

    logAppleSubscriptionEvent('guest_sign_in_existing', {
      userId: updatedUser.id,
      deviceId,
    });

    return updatedUser;
  }

  if (existingProfile?.user && !existingProfile.user.isGuest) {
    await prisma.guestProfile.delete({ where: { id: existingProfile.id } });
  }

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: generateGuestEmail(),
        isGuest: true,
        guestDeviceId: deviceId,
      },
    });

    await tx.guestProfile.create({
      data: {
        userId: createdUser.id,
        deviceId,
        deviceName: metadata.deviceName,
        platform: metadata.platform,
        appVersion: metadata.appVersion,
      },
    });

    return createdUser;
  });

  logAppleSubscriptionEvent('guest_sign_in_created', {
    userId: user.id,
    deviceId,
  });

  notifyAdminsOfNewUser({
    userId: user.id,
    email: user.email,
    name: user.name,
    isGuest: true,
  }).catch((err) => {
    console.error('Failed to notify admins about guest user', err);
  });

  return user;
}

function normalizeDeviceId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('deviceId is required');
  }
  return trimmed;
}

function generateGuestEmail(): string {
  return `guest-${crypto.randomUUID()}@guest.yumcut`;
}
