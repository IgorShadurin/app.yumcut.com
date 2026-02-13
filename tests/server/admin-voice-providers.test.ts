import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_PROVIDER_IDS } from '@/shared/constants/voice-providers';

const adminSettingFindUnique = vi.hoisted(() => vi.fn());
const adminSettingUpsert = vi.hoisted(() => vi.fn());
vi.mock('@/server/db', () => ({
  prisma: {
    adminSetting: {
      findUnique: adminSettingFindUnique,
      upsert: adminSettingUpsert,
    },
  },
}));

import { getAdminVoiceProviderSettings, updateAdminVoiceProviderSettings } from '@/server/admin/voice-providers';

describe('admin voice provider settings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    adminSettingFindUnique.mockReset();
    adminSettingUpsert.mockReset();
  });

  it('returns normalized settings from admin settings table', async () => {
    adminSettingFindUnique.mockResolvedValue({
      key: 'voiceProviders',
      value: { enabledProviders: ['inworld', 'invalid'] },
    });

    const result = await getAdminVoiceProviderSettings();

    expect(result).toEqual({ enabledProviders: ['inworld'] });
    expect(adminSettingUpsert).not.toHaveBeenCalled();
  });

  it('defaults to all providers when no stored settings exist', async () => {
    adminSettingFindUnique.mockResolvedValue(null);

    const result = await getAdminVoiceProviderSettings();

    expect(result).toEqual({ enabledProviders: VOICE_PROVIDER_IDS });
    expect(adminSettingUpsert).toHaveBeenCalledWith({
      where: { key: 'voiceProviders' },
      create: { key: 'voiceProviders', value: { enabledProviders: VOICE_PROVIDER_IDS } },
      update: { value: { enabledProviders: VOICE_PROVIDER_IDS } },
    });
  });

  it('updates settings with normalized provider list', async () => {
    adminSettingUpsert.mockResolvedValue(undefined);

    const result = await updateAdminVoiceProviderSettings({ enabledProviders: ['elevenlabs', 'bad'] });

    expect(result).toEqual({ enabledProviders: ['elevenlabs'] });
    expect(adminSettingUpsert).toHaveBeenCalledWith({
      where: { key: 'voiceProviders' },
      create: { key: 'voiceProviders', value: { enabledProviders: ['elevenlabs'] } },
      update: { value: { enabledProviders: ['elevenlabs'] } },
    });
  });
});
