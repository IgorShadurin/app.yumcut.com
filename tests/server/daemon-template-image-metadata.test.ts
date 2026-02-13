import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ProjectStatus } from '@/shared/constants/status';
import { makeVirtualPrisma } from '../daemon-and-api/virtual-prisma';

const API_PASSWORD = 'secret-template-images';

function makeRequest(url: string, init: RequestInit = {}) {
  return new NextRequest(new Request(url, init));
}

describe('daemon template image metadata', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DAEMON_API_PASSWORD = API_PASSWORD;
  });

  it('stores template image metadata when status updates include it', async () => {
    const prisma = makeVirtualPrisma();
    vi.doMock('@/server/db', () => ({ prisma }));
    const route = await import('@/app/api/daemon/projects/[projectId]/status/route');

    const project = await prisma.project.create({
      data: { userId: 'u1', title: 'Demo', status: ProjectStatus.ProcessScript },
    });
    const asset = await prisma.imageAsset.create({
      data: {
        projectId: project.id,
        path: 'media/projects/demo/images/001.jpg',
        publicUrl: 'http://media.local/images/001.jpg',
      },
    });

    const req = makeRequest(`http://localhost/api/daemon/projects/${project.id}/status`, {
      method: 'POST',
      headers: new Headers({
        'x-daemon-password': API_PASSWORD,
        'x-daemon-id': 'daemon-1',
        'content-type': 'application/json',
      }),
      body: JSON.stringify({
        status: ProjectStatus.ProcessAudio,
        extra: {
          templateImageMetadata: [
            {
              assetId: asset.id,
              image: 'images/001.jpg',
              model: 'runware',
              prompt: 'A test prompt',
              sentence: 'Sentence 1',
              size: '512x512',
              url: asset.publicUrl,
              path: asset.path,
            },
          ],
        },
      }),
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: project.id }) });
    expect(res.status).toBe(200);

    const rows = await prisma.projectTemplateImage.findMany({ where: { projectId: project.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId: project.id,
      imageAssetId: asset.id,
      imageName: '001.jpg',
      model: 'runware',
      prompt: 'A test prompt',
      sentence: 'Sentence 1',
      size: '512x512',
    });
  });

  it('rejects template image metadata when assets are missing', async () => {
    const prisma = makeVirtualPrisma();
    vi.doMock('@/server/db', () => ({ prisma }));
    const route = await import('@/app/api/daemon/projects/[projectId]/status/route');

    const project = await prisma.project.create({
      data: { userId: 'u1', title: 'Demo', status: ProjectStatus.ProcessScript },
    });

    const req = makeRequest(`http://localhost/api/daemon/projects/${project.id}/status`, {
      method: 'POST',
      headers: new Headers({
        'x-daemon-password': API_PASSWORD,
        'x-daemon-id': 'daemon-1',
        'content-type': 'application/json',
      }),
      body: JSON.stringify({
        status: ProjectStatus.ProcessAudio,
        extra: {
          templateImageMetadata: [
            {
              assetId: 'missing-asset',
              image: 'images/001.jpg',
              model: 'runware',
              prompt: 'A test prompt',
              sentence: 'Sentence 1',
              size: '512x512',
              url: 'http://media.local/images/001.jpg',
              path: 'media/projects/demo/images/001.jpg',
            },
          ],
        },
      }),
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: project.id }) });
    expect(res.status).toBe(400);
    const rows = await prisma.projectTemplateImage.findMany({ where: { projectId: project.id } });
    expect(rows).toHaveLength(0);
  });
});
