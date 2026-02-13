import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ProjectStatus } from '@/shared/constants/status';

const prismaMock = {
  project: { findFirst: vi.fn() },
  job: { findFirst: vi.fn() },
  projectTemplateImage: { findMany: vi.fn() },
  character: { findUnique: vi.fn() },
  characterVariation: { findUnique: vi.fn() },
  userCharacter: { findFirst: vi.fn() },
  userCharacterVariation: { findFirst: vi.fn() },
};

vi.mock('@/server/db', () => ({ prisma: prismaMock }));
vi.mock('@/server/api-user', () => ({ authenticateApiRequest: vi.fn() }));
vi.mock('@/server/admin/image-editor', () => ({
  getAdminImageEditorSettings: vi.fn(),
}));

import { authenticateApiRequest } from '@/server/api-user';
import { getAdminImageEditorSettings } from '@/server/admin/image-editor';

describe('project image editor payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.job.findFirst.mockResolvedValue({
      payload: { durationSeconds: 60, languages: ['en'] },
    });
    prismaMock.projectTemplateImage.findMany.mockResolvedValue([
      {
        id: 'pti-1',
        imageAssetId: 'asset-1',
        imageName: '001.jpg',
        model: 'runware',
        prompt: 'A prompt',
        sentence: 'A sentence',
        size: '512x512',
        imageAsset: { path: 'media/projects/p1/001.jpg', publicUrl: 'https://cdn.test/001.jpg' },
      },
    ]);
    vi.mocked(authenticateApiRequest).mockResolvedValue({ userId: 'user-1', source: 'session' } as any);
    vi.mocked(getAdminImageEditorSettings).mockResolvedValue({ enabled: true });
  });

  it('returns template custom data and template images with image editor flag', async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'p1',
      userId: 'user-1',
      title: 'Demo',
      prompt: 'Prompt',
      rawScript: null,
      status: ProjectStatus.Done,
      createdAt: new Date('2025-12-23T00:00:00Z'),
      updatedAt: new Date('2025-12-23T00:00:00Z'),
      languages: ['en'],
      scripts: [],
      audios: [],
      videos: [],
      statusLog: [{ status: ProjectStatus.Done, extra: {} }],
      selection: null,
      template: {
        id: 'tpl-1',
        title: 'Template',
        description: null,
        previewImageUrl: '/preview.jpg',
        previewVideoUrl: '/preview.mp4',
        customData: {
          type: 'custom',
          customId: 'v2-comics',
          supportsCustomCharacters: true,
          supportsExactText: true,
          supportsScriptPrompt: true,
        },
      },
    });

    const route = await import('@/app/api/projects/[projectId]/route');
    const req = new NextRequest('http://localhost/api/projects/p1');
    const res = await route.GET(req, { params: Promise.resolve({ projectId: 'p1' }) });

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.imageEditorEnabled).toBe(true);
    expect(payload.template?.customData?.type).toBe('custom');
    expect(payload.templateImages).toEqual([
      {
        id: 'pti-1',
        assetId: 'asset-1',
        imageName: '001.jpg',
        imageUrl: 'https://cdn.test/001.jpg',
        imagePath: 'media/projects/p1/001.jpg',
        model: 'runware',
        prompt: 'A prompt',
        sentence: 'A sentence',
        size: '512x512',
      },
    ]);
  });
});
