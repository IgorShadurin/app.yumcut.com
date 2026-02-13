import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

const runNpmCommandMock = vi.fn(async ({ logDir, logName, args }: any) => {
  await fs.mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, `${logName}.log`);
  await fs.writeFile(logPath, `args: ${JSON.stringify(args)}`, 'utf8');
  return { logPath, displayCommand: `npm ${args.join(' ')}` };
});

vi.mock('../../scripts/daemon/helpers/video/run-npm-command', () => ({
  runNpmCommand: runNpmCommandMock,
}));

describe('renderVideoParts CLI arguments', () => {
  let workspaceRoot: string;
  let metadataPath: string;
  let logDir: string;
  let imagesDir: string;
  let renderVideoParts: typeof import('../../scripts/daemon/helpers/video').renderVideoParts;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-video-parts-'));
    metadataPath = path.join(workspaceRoot, 'metadata', 'transcript-blocks.json');
    logDir = path.join(workspaceRoot, 'logs');
    imagesDir = path.join(workspaceRoot, 'images');
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify({ blocks: [{ id: 'b1' }] }), 'utf8');
    await fs.mkdir(imagesDir, { recursive: true });
    await fs.writeFile(path.join(imagesDir, '001.jpg'), 'image-bytes', 'utf8');
    await fs.writeFile(path.join(imagesDir, '002.jpg'), 'image-bytes', 'utf8');
    const finalDir = path.join(workspaceRoot, 'video-basic-effects', 'final');
    await fs.mkdir(finalDir, { recursive: true });
    await fs.writeFile(path.join(finalDir, 'simple.1080p.mp4'), 'video-bytes', 'utf8');
    runNpmCommandMock.mockClear();
    vi.resetModules();
    ({ renderVideoParts } = await import('../../scripts/daemon/helpers/video'));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('passes --fast flag by default', async () => {
    await renderVideoParts({
      projectId: 'video_fast',
      workspaceRoot,
      logDir,
      scriptWorkspaceV2: workspaceRoot,
      metadataJsonPath: metadataPath,
      effectName: 'neo_noir',
      imagesDir,
      includeCallToAction: false,
      clean: false,
    });

    expect(runNpmCommandMock).toHaveBeenCalledTimes(1);
    const args: string[] = runNpmCommandMock.mock.calls[0][0].args;
    expect(args).toContain('--fast');
  });

  it('omits --fast when scriptMode is normal', async () => {
    await renderVideoParts({
      projectId: 'video_normal',
      workspaceRoot,
      logDir,
      scriptWorkspaceV2: workspaceRoot,
      metadataJsonPath: metadataPath,
      effectName: 'neo_noir',
      imagesDir,
      includeCallToAction: false,
      clean: false,
      scriptMode: 'normal',
    });

    expect(runNpmCommandMock).toHaveBeenCalledTimes(1);
    const args: string[] = runNpmCommandMock.mock.calls[0][0].args;
    expect(args).not.toContain('--fast');
  });

  it('forces --fast when template v2 flag is set even in normal mode', async () => {
    await renderVideoParts({
      projectId: 'video_v2',
      workspaceRoot,
      logDir,
      scriptWorkspaceV2: workspaceRoot,
      metadataJsonPath: metadataPath,
      effectName: 'neo_noir',
      imagesDir,
      includeCallToAction: true,
      clean: false,
      scriptMode: 'normal',
      isTemplateV2: true,
    });

    expect(runNpmCommandMock).toHaveBeenCalledTimes(1);
    const args: string[] = runNpmCommandMock.mock.calls[0][0].args;
    expect(args).toContain('--fast');
  });

  it('writes parts timeline file based on metadata timestamps', async () => {
    const metadata = {
      blocks: [
        { id: 'b1', start: '00:00:00.000', end: '00:00:01.500', duration: '00:00:01.500' },
        { id: 'b2', start: '00:00:01.500', end: '00:00:04.200', duration: '00:00:02.700' },
      ],
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata), 'utf8');

    await renderVideoParts({
      projectId: 'video_timeline',
      workspaceRoot,
      logDir,
      scriptWorkspaceV2: workspaceRoot,
      metadataJsonPath: metadataPath,
      effectName: 'neo_noir',
      imagesDir,
      includeCallToAction: true,
      clean: false,
      scriptMode: 'fast',
    });

    const timelinePath = path.join(workspaceRoot, 'video-basic-effects', 'parts.txt');
    const contents = await fs.readFile(timelinePath, 'utf8');
    const lines = contents.trim().split('\n');
    expect(lines[0]).toBe('001.jpg - 001.mp4 - Duration: 00:00:01.500 - Timeline: 00:00:00.000-00:00:01.500');
    expect(lines[1]).toBe('002.jpg - 002.mp4 - Duration: 00:00:02.700 - Timeline: 00:00:01.500-00:00:04.200');
  });
});
