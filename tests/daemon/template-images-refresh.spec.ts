import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('template image refresh', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-template-images-'));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Buffer.from('image-bytes'),
    } as any)));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('downloads template images into the workspace', async () => {
    const { refreshTemplateImagesFromStorage } = await import('../../scripts/daemon/helpers/template-images');
    const imagesDir = await refreshTemplateImagesFromStorage({
      projectId: 'project-1',
      templateWorkspace: workspaceRoot,
      templateImages: [
        { imageName: '001.jpg', url: 'https://cdn.test/001.jpg' },
        { imageName: '002.jpg', url: 'https://cdn.test/002.jpg' },
      ],
    });

    const files = await fs.readdir(imagesDir);
    expect(files).toContain('001.jpg');
    expect(files).toContain('002.jpg');
  });

  it('throws when template image url is missing', async () => {
    const { refreshTemplateImagesFromStorage } = await import('../../scripts/daemon/helpers/template-images');
    await expect(
      refreshTemplateImagesFromStorage({
        projectId: 'project-1',
        templateWorkspace: workspaceRoot,
        templateImages: [{ imageName: '001.jpg' }],
      })
    ).rejects.toThrow(/missing a URL/i);
  });
});
