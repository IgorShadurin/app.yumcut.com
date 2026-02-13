import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ProjectStatus } from '@/shared/constants/status';

const prismaMock = {
  project: { findFirst: vi.fn() },
  projectTemplateImage: { findFirst: vi.fn(), update: vi.fn() },
  imageAsset: { create: vi.fn(), delete: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock('@/server/db', () => ({ prisma: prismaMock }));
vi.mock('@/server/auth', () => ({ getAuthSession: vi.fn() }));
vi.mock('@/server/admin/image-editor', () => ({ getAdminImageEditorSettings: vi.fn() }));
vi.mock('@/lib/upload-signature', () => ({
  verifySignedUploadGrant: vi.fn(),
  assertUploadGrantFresh: vi.fn(),
}));
vi.mock('@/server/storage', () => ({
  deleteStoredMedia: vi.fn(),
  normalizeMediaUrl: (value: string) => value,
  toStoredMediaPath: (value: string) => value,
}));

import { getAuthSession } from '@/server/auth';
import { getAdminImageEditorSettings } from '@/server/admin/image-editor';
import { verifySignedUploadGrant } from '@/lib/upload-signature';
import { deleteStoredMedia } from '@/server/storage';

describe('project image replace api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthSession).mockResolvedValue({ user: { id: 'user-1' } } as any);
    vi.mocked(getAdminImageEditorSettings).mockResolvedValue({ enabled: true });
    vi.mocked(verifySignedUploadGrant).mockReturnValue({
      userId: 'user-1',
      purpose: 'user-character-image',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nonce: 'nonce',
      maxBytes: 1024,
      mimeTypes: ['image/jpeg'],
    } as any);
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      status: ProjectStatus.Done,
      template: { customData: { type: 'custom', customId: 'v2-comics' } },
    });
    prismaMock.projectTemplateImage.findFirst.mockResolvedValue({
      id: 'img-1',
      projectId: 'project-1',
      imageAssetId: 'asset-old',
      imageAsset: { path: 'image/2024/01/old.jpg', publicUrl: 'https://cdn.test/old.jpg' },
    });
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        imageAsset: {
          create: vi.fn().mockResolvedValue({
            id: 'asset-new',
            path: 'characters/2024/01/new.jpg',
            publicUrl: 'https://cdn.test/new.jpg',
          }),
        },
        projectTemplateImage: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces template image and deletes old storage asset', async () => {
    const route = await import('@/app/api/projects/[projectId]/images/replace/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/images/replace', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        templateImageId: 'img-1',
        data: 'signed',
        signature: 'sig',
        path: 'characters/2024/01/new.jpg',
        url: 'https://cdn.test/new.jpg',
        prompt: 'New prompt',
        model: 'runware:108@1',
      }),
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(200);
    expect(deleteStoredMedia).toHaveBeenCalledWith(['image/2024/01/old.jpg'], { userId: 'user-1' });
    expect(prismaMock.imageAsset.delete).toHaveBeenCalledWith({ where: { id: 'asset-old' } });
  });

  it('rejects when editor is disabled', async () => {
    vi.mocked(getAdminImageEditorSettings).mockResolvedValue({ enabled: false });
    const route = await import('@/app/api/projects/[projectId]/images/replace/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/images/replace', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        templateImageId: 'img-1',
        data: 'signed',
        signature: 'sig',
        path: 'characters/2024/01/new.jpg',
        url: 'https://cdn.test/new.jpg',
      }),
    });
    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(403);
  });
});
