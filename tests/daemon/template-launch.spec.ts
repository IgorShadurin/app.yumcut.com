import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

import { loadTemplateLaunchSnapshotIfExists, __templateLaunchInternals } from '../../scripts/daemon/helpers/template-launch';

const { buildCliArgs, readResultSnapshot } = __templateLaunchInternals;

describe('template launch helpers', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'template-launch-'));
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
  });

  it('builds CLI args with optional flags', () => {
    const args = buildCliArgs({
      templatePath: '/abs/template.json',
      modulePath: '/abs/template.ts',
      workspaceDir: '/workdir',
      durationSeconds: 127.6,
      languages: ['en', ' es '],
      userPrompt: '  Tell a story ',
      autoApprove: false,
    });

    expect(args).toEqual([
      'run',
      'template:launch',
      '--',
      '--template', '/abs/template.json',
      '--workspace', '/workdir',
      '--duration', '128',
      '--module', '/abs/template.ts',
      '--languages', 'en,es',
      '--user-prompt', '  Tell a story ',
      '--no-auto-approve',
    ]);
  });

  it('builds CLI args when user text path is provided', () => {
    const args = buildCliArgs({
      templatePath: '/abs/template.json',
      modulePath: null,
      workspaceDir: '/workdir',
      durationSeconds: 90,
      userTextPath: '  /tmp/story.txt ',
      autoApprove: true,
    });

    expect(args).toEqual([
      'run',
      'template:launch',
      '--',
      '--template', '/abs/template.json',
      '--workspace', '/workdir',
      '--duration', '90',
      '--user-text', '/tmp/story.txt',
    ]);
  });

  it('throws when both user prompt and text path are passed', () => {
    expect(() => buildCliArgs({
      templatePath: '/abs/template.json',
      modulePath: null,
      workspaceDir: '/workdir',
      durationSeconds: 60,
      userPrompt: 'Prompt',
      userTextPath: '/tmp/story.txt',
      autoApprove: true,
    })).toThrow('requires exactly one');
  });

  it('normalizes snapshot output paths', async () => {
    const scriptsDir = path.join(workspace, 'scripts');
    await fs.mkdir(scriptsDir, { recursive: true });
    const textPath = path.join(scriptsDir, 'story.txt');
    await fs.writeFile(textPath, 'Story', 'utf8');
    const imagesDir = path.join(workspace, 'images');
    await fs.mkdir(imagesDir, { recursive: true });
    const imagePath = path.join(imagesDir, '001.png');
    await fs.writeFile(imagePath, 'PNG', 'utf8');
    const resultPath = path.join(workspace, 'result.json');
    const data = {
      textScript: { EN: textPath },
      images: [imagePath, '', '   '],
    };
    await fs.writeFile(resultPath, JSON.stringify(data, null, 2), 'utf8');

    const snapshot = await readResultSnapshot(resultPath);
    expect(snapshot.textScript).toEqual({ en: textPath });
    expect(snapshot.images).toEqual([imagePath]);
    expect(snapshot.imageMetadata).toEqual([]);
  });

  it('parses image metadata when images.json exists', async () => {
    const imagesDir = path.join(workspace, 'image-generation');
    await fs.mkdir(imagesDir, { recursive: true });
    await fs.writeFile(
      path.join(imagesDir, 'images.json'),
      JSON.stringify([{ image: '001.jpg', model: 'runware:108@1', prompt: 'Prompt', sentence: 'Line', size: '768x1024' }], null, 2),
      'utf8'
    );
    const resultPath = path.join(workspace, 'result.json');
    await fs.writeFile(resultPath, JSON.stringify({ textScript: {} }), 'utf8');

    const snapshot = await readResultSnapshot(resultPath);

    expect(snapshot.imageMetadata).toEqual([
      {
        image: '001.jpg',
        model: 'runware:108@1',
        prompt: 'Prompt',
        sentence: 'Line',
        size: '768x1024',
        raw: { image: '001.jpg', model: 'runware:108@1', prompt: 'Prompt', sentence: 'Line', size: '768x1024' },
      },
    ]);
  });

  it('throws when image metadata is missing required fields', async () => {
    const imagesDir = path.join(workspace, 'image-generation');
    await fs.mkdir(imagesDir, { recursive: true });
    await fs.writeFile(path.join(imagesDir, 'images.json'), JSON.stringify([{ model: 'runware:108@1', prompt: 'Prompt' }]), 'utf8');
    const resultPath = path.join(workspace, 'result.json');
    await fs.writeFile(resultPath, JSON.stringify({ textScript: {} }), 'utf8');

    await expect(readResultSnapshot(resultPath)).rejects.toThrow('image-generation/images.json[0].image');
  });

  it('loads cached snapshot when files exist', async () => {
    const scriptsDir = path.join(workspace, 'lang');
    await fs.mkdir(scriptsDir, { recursive: true });
    const textPath = path.join(scriptsDir, 'script.txt');
    await fs.writeFile(textPath, 'text', 'utf8');
    const resultPath = path.join(workspace, 'result.json');
    await fs.writeFile(resultPath, JSON.stringify({ textScript: { en: textPath } }), 'utf8');

    const snapshot = await loadTemplateLaunchSnapshotIfExists(resultPath);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.textScript.en).toBe(textPath);

    const missing = await loadTemplateLaunchSnapshotIfExists(path.join(workspace, 'missing.json'));
    expect(missing).toBeNull();
  });
});
