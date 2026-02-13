import { prisma } from '@/server/db';
import { VOICE_PROVIDER_IDS, buildVoiceProviderSet } from '@/shared/constants/voice-providers';
import { ADMIN_SETTING_KEYS, getAdminSettingValue, setAdminSettingValue } from '@/server/admin/admin-settings';

export type AdminVoiceProviderSettings = {
  enabledProviders: string[];
};

type AdminVoiceProviderRecord = {
  enabledProviders?: unknown;
};

function normalizeEnabledProviders(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...VOICE_PROVIDER_IDS];
  const set = buildVoiceProviderSet(raw);
  return VOICE_PROVIDER_IDS.filter((id) => set.has(id));
}

function mapRecordToSettings(record: AdminVoiceProviderRecord): AdminVoiceProviderSettings {
  return {
    enabledProviders: normalizeEnabledProviders(record.enabledProviders),
  };
}

async function getSettingsFromAdminTable(
  tx: Parameters<typeof getAdminSettingValue>[1] = prisma
): Promise<AdminVoiceProviderSettings | null> {
  const payload = await getAdminSettingValue<AdminVoiceProviderRecord>(ADMIN_SETTING_KEYS.voiceProviders, tx);
  if (!payload || typeof payload !== 'object') return null;
  return mapRecordToSettings(payload);
}

async function persistSettings(
  settings: AdminVoiceProviderSettings,
  tx: Parameters<typeof setAdminSettingValue>[2] = prisma
): Promise<void> {
  await setAdminSettingValue(ADMIN_SETTING_KEYS.voiceProviders, settings, tx);
}

export async function getAdminVoiceProviderSettings(): Promise<AdminVoiceProviderSettings> {
  const existing = await getSettingsFromAdminTable();
  if (existing) return existing;
  const defaults = { enabledProviders: [...VOICE_PROVIDER_IDS] };
  await persistSettings(defaults);
  return defaults;
}

export async function updateAdminVoiceProviderSettings(
  update: Partial<AdminVoiceProviderSettings>
): Promise<AdminVoiceProviderSettings> {
  if (!update || !Array.isArray(update.enabledProviders)) {
    return getAdminVoiceProviderSettings();
  }
  const set = buildVoiceProviderSet(update.enabledProviders);
  const data = { enabledProviders: VOICE_PROVIDER_IDS.filter((id) => set.has(id)) };
  const next = mapRecordToSettings(data);
  await persistSettings(next);
  return next;
}
