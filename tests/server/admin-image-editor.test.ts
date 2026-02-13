import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { getAdminImageEditorSettings, updateAdminImageEditorSettings } from '@/server/admin/image-editor';

describe('admin image editor settings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    adminSettingFindUnique.mockReset();
    adminSettingUpsert.mockReset();
  });

  it('returns stored settings when present', async () => {
    adminSettingFindUnique.mockResolvedValue({ key: 'imageEditor', value: { enabled: true } });

    const result = await getAdminImageEditorSettings();

    expect(result).toEqual({ enabled: true });
    expect(adminSettingUpsert).not.toHaveBeenCalled();
  });

  it('normalizes invalid settings and persists defaults', async () => {
    adminSettingFindUnique.mockResolvedValue({ key: 'imageEditor', value: { enabled: 'nope' } });

    const result = await getAdminImageEditorSettings();

    expect(result).toEqual({ enabled: false });
    expect(adminSettingUpsert).toHaveBeenCalledWith({
      where: { key: 'imageEditor' },
      create: { key: 'imageEditor', value: { enabled: false } },
      update: { value: { enabled: false } },
    });
  });

  it('persists defaults when no settings exist', async () => {
    adminSettingFindUnique.mockResolvedValue(null);

    const result = await getAdminImageEditorSettings();

    expect(result).toEqual({ enabled: false });
    expect(adminSettingUpsert).toHaveBeenCalledWith({
      where: { key: 'imageEditor' },
      create: { key: 'imageEditor', value: { enabled: false } },
      update: { value: { enabled: false } },
    });
  });

  it('updates settings', async () => {
    adminSettingUpsert.mockResolvedValue(undefined);

    const result = await updateAdminImageEditorSettings({ enabled: true });

    expect(result).toEqual({ enabled: true });
    expect(adminSettingUpsert).toHaveBeenCalledWith({
      where: { key: 'imageEditor' },
      create: { key: 'imageEditor', value: { enabled: true } },
      update: { value: { enabled: true } },
    });
  });
});
