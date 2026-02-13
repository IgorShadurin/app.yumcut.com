import { ADMIN_SETTING_KEYS, getAdminSettingValue, setAdminSettingValue } from '@/server/admin/admin-settings';
import { prisma } from '@/server/db';

export type AdminImageEditorSettings = {
  enabled: boolean;
};

const DEFAULT_SETTINGS: AdminImageEditorSettings = {
  enabled: false,
};

export async function getAdminImageEditorSettings(
  tx: Parameters<typeof getAdminSettingValue>[1] = prisma
): Promise<AdminImageEditorSettings> {
  const record = await getAdminSettingValue<AdminImageEditorSettings>(ADMIN_SETTING_KEYS.imageEditor, tx);
  if (!record || typeof record !== 'object') {
    await setAdminSettingValue(ADMIN_SETTING_KEYS.imageEditor, DEFAULT_SETTINGS, tx);
    return DEFAULT_SETTINGS;
  }
  const enabled = typeof (record as AdminImageEditorSettings).enabled === 'boolean'
    ? (record as AdminImageEditorSettings).enabled
    : DEFAULT_SETTINGS.enabled;
  const normalized = { enabled };
  if (enabled !== (record as AdminImageEditorSettings).enabled) {
    await setAdminSettingValue(ADMIN_SETTING_KEYS.imageEditor, normalized, tx);
  }
  return normalized;
}

export async function updateAdminImageEditorSettings(
  update: Partial<AdminImageEditorSettings>
): Promise<AdminImageEditorSettings> {
  if (!update || typeof update.enabled !== 'boolean') {
    return getAdminImageEditorSettings();
  }
  const next = { enabled: update.enabled };
  await setAdminSettingValue(ADMIN_SETTING_KEYS.imageEditor, next);
  return next;
}
