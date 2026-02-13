import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ProjectStatus } from '@/shared/constants/status';

const prismaMock = {
  project: { findFirst: vi.fn() },
  projectTemplateImage: { findFirst: vi.fn() },
};

vi.mock('@/server/db', () => ({ prisma: prismaMock }));
vi.mock('@/server/auth', () => ({ getAuthSession: vi.fn() }));
vi.mock('@/server/tokens', () => ({
  grantTokens: vi.fn(),
  spendTokens: vi.fn(),
  InsufficientTokensError: class InsufficientTokensError extends Error {
    public readonly code = 'INSUFFICIENT_TOKENS';
    public readonly status = 402;
    public readonly details = { balance: 0, required: 0 };
  },
  makeUserInitiator: (id: string) => `user:${id}`,
  TOKEN_TRANSACTION_TYPES: {
    imageRegeneration: 'IMAGE_REGENERATION',
    imageRegenerationRefund: 'IMAGE_REGENERATION_REFUND',
  },
}));
vi.mock('@/server/admin/image-editor', () => ({
  getAdminImageEditorSettings: vi.fn(),
}));
vi.mock('@/server/config', () => ({
  config: { RUNWARE_IMAGE_EDITOR_API_KEY: 'rw_test_key' },
}));

import { getAuthSession } from '@/server/auth';
import { getAdminImageEditorSettings } from '@/server/admin/image-editor';
import { grantTokens, spendTokens } from '@/server/tokens';

describe('image regeneration api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(getAuthSession).mockResolvedValue({ user: { id: 'user-1' } } as any);
    vi.mocked(getAdminImageEditorSettings).mockResolvedValue({ enabled: true });
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      status: ProjectStatus.Done,
      template: {
        customData: { type: 'custom', customId: 'v2-comics' },
      },
    });
    prismaMock.projectTemplateImage.findFirst.mockResolvedValue({
      id: 'img-1',
      projectId: 'project-1',
      imageAssetId: 'asset-1',
      model: 'runware:108@1',
      prompt: 'Old prompt',
      size: '768x1344',
      imageAsset: { path: 'media/projects/project-1/001.jpg', publicUrl: 'https://cdn.test/001.jpg' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns base64 image data and charges tokens', async () => {
    const responseJson = {
      data: [
        { imageBase64Data: Buffer.from('fake-image').toString('base64') },
      ],
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(responseJson),
    });

    const route = await import('@/app/api/projects/[projectId]/images/regenerate/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/images/regenerate', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        templateImageId: 'img-1',
        prompt: 'New prompt',
        provider: 'runware',
        model: 'runware:108@1',
      }),
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.format).toBe('jpg');
    expect(payload.imageBase64).toBe(Buffer.from('fake-image').toString('base64'));
    expect(spendTokens).toHaveBeenCalled();
    expect(grantTokens).not.toHaveBeenCalled();
  });

  it('rejects prompt exceeding limits', async () => {
    const route = await import('@/app/api/projects/[projectId]/images/regenerate/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/images/regenerate', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        templateImageId: 'img-1',
        prompt: 'x'.repeat(1900),
        provider: 'runware',
      }),
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(400);
  });

  it('rejects when editor is disabled', async () => {
    vi.mocked(getAdminImageEditorSettings).mockResolvedValue({ enabled: false });
    const route = await import('@/app/api/projects/[projectId]/images/regenerate/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/images/regenerate', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        templateImageId: 'img-1',
        prompt: 'New prompt',
        provider: 'runware',
      }),
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(403);
    expect(spendTokens).not.toHaveBeenCalled();
    expect(grantTokens).not.toHaveBeenCalled();
  });

  it('rejects non-custom templates', async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      status: ProjectStatus.Done,
      template: {
        customData: { type: 'legacy' },
      },
    });
    const route = await import('@/app/api/projects/[projectId]/images/regenerate/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/images/regenerate', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        templateImageId: 'img-1',
        prompt: 'New prompt',
        provider: 'runware',
      }),
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(400);
    expect(spendTokens).not.toHaveBeenCalled();
    expect(grantTokens).not.toHaveBeenCalled();
  });

  it('rejects when template image size is invalid', async () => {
    prismaMock.projectTemplateImage.findFirst.mockResolvedValue({
      id: 'img-1',
      projectId: 'project-1',
      imageAssetId: 'asset-1',
      model: 'runware:108@1',
      prompt: 'Old prompt',
      size: 'unknown',
      imageAsset: { path: 'media/projects/project-1/001.jpg', publicUrl: 'https://cdn.test/001.jpg' },
    });
    const route = await import('@/app/api/projects/[projectId]/images/regenerate/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/images/regenerate', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        templateImageId: 'img-1',
        prompt: 'New prompt',
        provider: 'runware',
      }),
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(400);
    expect(spendTokens).not.toHaveBeenCalled();
    expect(grantTokens).not.toHaveBeenCalled();
  });

  it('rejects when template image size violates constraints', async () => {
    prismaMock.projectTemplateImage.findFirst.mockResolvedValue({
      id: 'img-1',
      projectId: 'project-1',
      imageAssetId: 'asset-1',
      model: 'runware:108@1',
      prompt: 'Old prompt',
      size: '1000x1000',
      imageAsset: { path: 'media/projects/project-1/001.jpg', publicUrl: 'https://cdn.test/001.jpg' },
    });
    const route = await import('@/app/api/projects/[projectId]/images/regenerate/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/images/regenerate', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        templateImageId: 'img-1',
        prompt: 'New prompt',
        provider: 'runware',
      }),
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(400);
    expect(spendTokens).not.toHaveBeenCalled();
    expect(grantTokens).not.toHaveBeenCalled();
  });

  it('refunds tokens when regeneration fails', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server error',
      text: async () => 'failed',
    });

    const route = await import('@/app/api/projects/[projectId]/images/regenerate/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/images/regenerate', {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        templateImageId: 'img-1',
        prompt: 'New prompt',
        provider: 'runware',
        model: 'runware:108@1',
      }),
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(500);
    expect(spendTokens).toHaveBeenCalled();
    expect(grantTokens).toHaveBeenCalled();
  });
});
