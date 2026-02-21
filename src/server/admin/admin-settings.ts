import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';

export const ADMIN_SETTING_KEYS = {
  voiceProviders: 'voiceProviders',
  imageEditor: 'imageEditor',
  projectCreation: 'projectCreation',
} as const;

export type AdminSettingKey = (typeof ADMIN_SETTING_KEYS)[keyof typeof ADMIN_SETTING_KEYS];

function getAdminSettingDelegate(tx: Prisma.TransactionClient | typeof prisma) {
  return (tx as any).adminSetting as
    | {
        findUnique: (args: { where: { key: string } }) => Promise<{ key: string; value: unknown } | null>;
        upsert: (args: {
          where: { key: string };
          create: { key: string; value: unknown };
          update: { value: unknown };
        }) => Promise<void>;
      }
    | undefined;
}

export async function getAdminSettingValue<T>(
  key: AdminSettingKey,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<T | null> {
  const adminSetting = getAdminSettingDelegate(tx);
  if (!adminSetting) return null;
  const record = await adminSetting.findUnique({ where: { key } });
  return (record?.value as T | undefined) ?? null;
}

export async function setAdminSettingValue<T>(
  key: AdminSettingKey,
  value: T,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  const adminSetting = getAdminSettingDelegate(tx);
  if (!adminSetting) return;
  await adminSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
