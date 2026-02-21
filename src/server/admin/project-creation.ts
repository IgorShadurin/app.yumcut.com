import { ADMIN_SETTING_KEYS, getAdminSettingValue, setAdminSettingValue } from '@/server/admin/admin-settings';
import { prisma } from '@/server/db';
import type { Prisma } from '@prisma/client';

const DEFAULT_REASON = 'Project creation is temporarily unavailable.';
const DISABLED_REASON_MAX_LENGTH = 500;
type AdminSettingTransaction = Prisma.TransactionClient | typeof prisma;

export type ProjectCreationSettings = {
  enabled: boolean;
  disabledReason: string;
};

function normalizeDisabledReason(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, DISABLED_REASON_MAX_LENGTH);
}

function normalizeProjectCreationSettings(raw: unknown): ProjectCreationSettings {
  if (!raw || typeof raw !== 'object') {
    return { enabled: true, disabledReason: '' };
  }
  const candidate = raw as Partial<ProjectCreationSettings>;
  const enabled = candidate.enabled === true ? true : candidate.enabled === false ? false : true;
  const normalizedReason = normalizeDisabledReason(candidate.disabledReason);
  return {
    enabled,
    disabledReason: enabled ? normalizedReason : normalizedReason || DEFAULT_REASON,
  };
}

async function getRawProjectCreationSettings(
  tx: AdminSettingTransaction = prisma
): Promise<ProjectCreationSettings | null> {
  const raw = await getAdminSettingValue<ProjectCreationSettings>(ADMIN_SETTING_KEYS.projectCreation, tx);
  if (!raw || typeof raw !== 'object') return null;
  return normalizeProjectCreationSettings(raw);
}

async function setProjectCreationSettings(
  payload: ProjectCreationSettings,
  tx: AdminSettingTransaction = prisma,
) {
  await setAdminSettingValue(ADMIN_SETTING_KEYS.projectCreation, payload, tx);
}

export async function getProjectCreationSettings(
  tx: AdminSettingTransaction = prisma
): Promise<ProjectCreationSettings> {
  const fromDb = await getRawProjectCreationSettings(tx);
  if (fromDb) return fromDb;
  const fallback = { enabled: true, disabledReason: '' };
  await setProjectCreationSettings(fallback, tx);
  return fallback;
}

export async function updateProjectCreationSettings(
  update: { enabled?: boolean; disabledReason?: unknown }
): Promise<ProjectCreationSettings> {
  const existing = await getProjectCreationSettings();
  const enabled = typeof update.enabled === 'boolean' ? update.enabled : existing.enabled;
  const disabledReason =
    typeof update.disabledReason === 'undefined'
      ? existing.disabledReason
      : normalizeDisabledReason(update.disabledReason);
  const next: ProjectCreationSettings = {
    enabled,
    disabledReason: enabled ? disabledReason : disabledReason || DEFAULT_REASON,
  };
  await setProjectCreationSettings(next);
  return next;
}
