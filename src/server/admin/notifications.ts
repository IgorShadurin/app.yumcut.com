import { Prisma, AdminNotificationSetting } from '@prisma/client';
import { prisma } from '@/server/db';

export type AdminNotificationSettings = {
  notifyNewUser: boolean;
  notifyNewProject: boolean;
  notifyProjectDone: boolean;
  notifyProjectError: boolean;
};

type AdminNotificationRecord = AdminNotificationSetting & { notifyProjectError?: boolean };

function mapRecordToSettings(record: AdminNotificationRecord): AdminNotificationSettings {
  const notifyProjectError = typeof record.notifyProjectError === 'boolean' ? record.notifyProjectError : true;
  return {
    notifyNewUser: record.notifyNewUser,
    notifyNewProject: record.notifyNewProject,
    notifyProjectDone: record.notifyProjectDone,
    notifyProjectError,
  };
}

async function ensureSettings(tx: Prisma.TransactionClient | typeof prisma = prisma): Promise<AdminNotificationSetting> {
  let record = await tx.adminNotificationSetting.findFirst();
  if (!record) {
    record = await tx.adminNotificationSetting.create({ data: {} });
  }
  return record;
}

export async function getAdminNotificationSettings(): Promise<AdminNotificationSettings> {
  const record = await ensureSettings();
  return mapRecordToSettings(record as AdminNotificationRecord);
}

export async function updateAdminNotificationSettings(update: Partial<AdminNotificationSettings>): Promise<AdminNotificationSettings> {
  const data: Partial<AdminNotificationSettings> = {};
  if (typeof update.notifyNewUser === 'boolean') data.notifyNewUser = update.notifyNewUser;
  if (typeof update.notifyNewProject === 'boolean') data.notifyNewProject = update.notifyNewProject;
  if (typeof update.notifyProjectDone === 'boolean') data.notifyProjectDone = update.notifyProjectDone;
  if (typeof update.notifyProjectError === 'boolean') data.notifyProjectError = update.notifyProjectError;
  if (Object.keys(data).length === 0) {
    return getAdminNotificationSettings();
  }
  const current = await ensureSettings();
  const updated = await prisma.adminNotificationSetting.update({ where: { id: current.id }, data });
  return mapRecordToSettings(updated as AdminNotificationRecord);
}

export async function shouldNotifyAdmins(
  kind:
    | 'new_user'
    | 'guest_converted'
    | 'new_project'
    | 'project_done'
    | 'project_error'
    | 'new_group'
    | 'subscription_purchase'
    | 'subscription_cancelled'
    | 'account_deleted',
): Promise<boolean> {
  const settings = await getAdminNotificationSettings();
  if (kind === 'new_user' || kind === 'guest_converted') return settings.notifyNewUser;
  if (kind === 'account_deleted') return settings.notifyNewUser;
  if (kind === 'new_project') return settings.notifyNewProject;
  if (kind === 'new_group') return settings.notifyNewProject; // reuse the same toggle
  if (kind === 'project_done') return settings.notifyProjectDone;
  if (kind === 'project_error') return settings.notifyProjectError;
  if (kind === 'subscription_purchase') return settings.notifyNewProject;
  if (kind === 'subscription_cancelled') return settings.notifyProjectError;
  return false;
}
