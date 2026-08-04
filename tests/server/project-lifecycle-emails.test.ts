import { beforeEach, describe, expect, it, vi } from 'vitest';

const settingsFindUnique = vi.hoisted(() => vi.fn());
const sendLocalizedPlainTextEmail = vi.hoisted(() => vi.fn());

vi.mock('@/server/db', () => ({
  prisma: {
    userSettings: {
      findUnique: settingsFindUnique,
    },
  },
}));

vi.mock('@/server/config', () => ({
  config: {
    NEXTAUTH_URL: 'https://app.yumcut.com',
  },
}));

vi.mock('@/server/storage', () => ({
  normalizeMediaUrl: (value: string | null | undefined) => value,
}));

vi.mock('@/server/emails/planned', () => ({
  EMAIL_KIND_IMAGE_PROJECT_CREATED: 'image_project_created_v1',
  EMAIL_KIND_IMAGE_PROJECT_READY: 'image_project_ready_v1',
  EMAIL_KIND_PROJECT_CREATED: 'project_created_v1',
  EMAIL_KIND_PROJECT_READY: 'project_ready_v1',
  EMAIL_KIND_PROJECT_FAILED: 'project_failed_v1',
  normalizeEmail: (value?: string | null) => {
    if (!value) return null;
    const next = value.trim().toLowerCase();
    return next.includes('@') ? next : null;
  },
  sendLocalizedPlainTextEmail,
}));

describe('project lifecycle emails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsFindUnique.mockResolvedValue(null);
    sendLocalizedPlainTextEmail.mockResolvedValue({ ok: true, language: 'en' });
  });

  it('sends project created email when setting is missing (default enabled)', async () => {
    const mod = await import('@/server/emails/project-lifecycle');
    const result = await mod.sendProjectCreatedEmail({
      userId: 'user-1',
      email: 'User@Example.com',
      name: 'Dmitry',
      preferredLanguage: 'en',
      projectId: 'project-1',
      projectTitle: 'My Project',
    });

    expect(result).toEqual({ sent: true, skipped: false, error: null });
    expect(sendLocalizedPlainTextEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      kind: 'project_created_v1',
      variables: expect.objectContaining({
        project_url: 'https://app.yumcut.com/project/project-1',
        project_title: 'My Project',
      }),
    }));
  });

  it('does not send lifecycle emails when user disabled them', async () => {
    settingsFindUnique.mockResolvedValue({ projectEmailsEnabled: false });
    const mod = await import('@/server/emails/project-lifecycle');

    const created = await mod.sendProjectCreatedEmail({
      userId: 'user-1',
      email: 'user@example.com',
      projectId: 'project-1',
    });
    const ready = await mod.sendProjectReadyEmail({
      userId: 'user-1',
      email: 'user@example.com',
      projectId: 'project-1',
      finalVideoUrl: 'https://cdn.example.com/final.mp4',
    });
    const imageCreated = await mod.sendImageProjectCreatedEmail({
      userId: 'user-1',
      email: 'user@example.com',
      projectId: 'project-1',
    });
    const imageReady = await mod.sendImageProjectReadyEmail({
      userId: 'user-1',
      email: 'user@example.com',
      projectId: 'project-1',
    });
    const failed = await mod.sendProjectFailedEmail({
      userId: 'user-1',
      email: 'user@example.com',
      projectId: 'project-1',
      refundedTokens: 30,
    });

    expect(created).toEqual({ sent: false, skipped: true, reason: 'disabled-by-user' });
    expect(ready).toEqual({ sent: false, skipped: true, reason: 'disabled-by-user' });
    expect(imageCreated).toEqual({ sent: false, skipped: true, reason: 'disabled-by-user' });
    expect(imageReady).toEqual({ sent: false, skipped: true, reason: 'disabled-by-user' });
    expect(failed).toEqual({ sent: false, skipped: true, reason: 'disabled-by-user' });
    expect(sendLocalizedPlainTextEmail).not.toHaveBeenCalled();
  });

  it('uses image-specific templates for image project lifecycle emails', async () => {
    const mod = await import('@/server/emails/project-lifecycle');

    await mod.sendImageProjectCreatedEmail({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'Dmitry',
      preferredLanguage: 'en',
      projectId: 'image-project-1',
      projectTitle: 'Image Prank',
    });
    await mod.sendImageProjectReadyEmail({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'Dmitry',
      preferredLanguage: 'en',
      projectId: 'image-project-1',
      projectTitle: 'Image Prank',
    });

    expect(sendLocalizedPlainTextEmail).toHaveBeenNthCalledWith(1, expect.objectContaining({
      kind: 'image_project_created_v1',
      variables: {
        project_title: 'Image Prank',
        project_url: 'https://app.yumcut.com/project/image-project-1',
      },
    }));
    expect(sendLocalizedPlainTextEmail).toHaveBeenNthCalledWith(2, expect.objectContaining({
      kind: 'image_project_ready_v1',
      variables: {
        project_title: 'Image Prank',
        project_url: 'https://app.yumcut.com/project/image-project-1',
      },
    }));
  });

  it('includes final video url in project ready email', async () => {
    const mod = await import('@/server/emails/project-lifecycle');
    const result = await mod.sendProjectReadyEmail({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'Dmitry',
      preferredLanguage: 'ru',
      projectId: 'project-2',
      finalVideoUrl: 'https://cdn.example.com/final.mp4',
    });

    expect(result).toEqual({ sent: true, skipped: false, error: null });
    expect(sendLocalizedPlainTextEmail).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'project_ready_v1',
      variables: expect.objectContaining({
        project_url: 'https://app.yumcut.com/project/project-2',
        final_video_url: 'https://cdn.example.com/final.mp4',
      }),
    }));
  });

  it('includes refund amount in project failed email', async () => {
    const mod = await import('@/server/emails/project-lifecycle');
    const result = await mod.sendProjectFailedEmail({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'Dmitry',
      preferredLanguage: 'en',
      projectId: 'project-3',
      projectTitle: 'Failed title',
      refundedTokens: 1234,
    });

    expect(result).toEqual({ sent: true, skipped: false, error: null });
    expect(sendLocalizedPlainTextEmail).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'project_failed_v1',
      variables: expect.objectContaining({
        project_url: 'https://app.yumcut.com/project/project-3',
        project_title: 'Failed title',
        refunded_tokens: '1,234',
      }),
    }));
  });
});
