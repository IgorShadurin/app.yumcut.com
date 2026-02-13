import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

const runNpmCommandMock = vi.fn(async (options: any) => {
  const { logDir, logName, args } = options;
  await fs.mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, `${logName}.log`);
  await fs.writeFile(logPath, `args: ${JSON.stringify(args)}`, 'utf8');
  return { logPath, displayCommand: `npm ${args.join(' ')}` };
});

vi.mock('../../scripts/daemon/helpers/video/run-npm-command', () => ({
  runNpmCommand: runNpmCommandMock,
}));

describe('generateImages CLI arguments', () => {
  let workspaceRoot: string;
  let metadataPath: string;
  let characterImagePath: string;
  let generateImages: typeof import('../../scripts/daemon/helpers/images').generateImages;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-generate-images-'));
    metadataPath = path.join(workspaceRoot, 'metadata.json');
    characterImagePath = path.join(workspaceRoot, 'character.png');
    await fs.writeFile(metadataPath, JSON.stringify({ blocks: [] }), 'utf8');
    await fs.writeFile(characterImagePath, 'dummy image', 'utf8');
    runNpmCommandMock.mockClear();
    vi.resetModules();
    ({ generateImages } = await import('../../scripts/daemon/helpers/images'));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('passes the character image path when using an existing character', async () => {
    await generateImages({
      projectId: 'proj_static',
      workspaceRoot,
      logDir: path.join(workspaceRoot, 'logs'),
      metadataJsonPath: metadataPath,
      characterImagePath,
      scriptWorkspaceV2: workspaceRoot,
    } as any);

    expect(runNpmCommandMock).toHaveBeenCalledTimes(1);
    const [call] = runNpmCommandMock.mock.calls;
    const args: string[] = call[0].args;
    expect(args).toContain('--fast');
    expect(args.some((arg) => arg.startsWith('--character-image='))).toBe(true);
    expect(args.includes('--new-character')).toBe(false);
  });

  it('passes the --new-character flag when generating a dynamic character', async () => {
    await generateImages({
      projectId: 'proj_dynamic',
      workspaceRoot,
      logDir: path.join(workspaceRoot, 'logs'),
      metadataJsonPath: metadataPath,
      characterImagePath: null,
      scriptWorkspaceV2: workspaceRoot,
      newCharacter: true,
    } as any);

    expect(runNpmCommandMock).toHaveBeenCalledTimes(1);
    const [call] = runNpmCommandMock.mock.calls;
    const args: string[] = call[0].args;
    expect(args).toContain('--fast');
    expect(args.includes('--new-character')).toBe(true);
    expect(args.some((arg) => arg.startsWith('--character-image='))).toBe(false);
  });

  it('omits --fast when scriptMode is normal', async () => {
    await generateImages({
      projectId: 'proj_normal',
      workspaceRoot,
      logDir: path.join(workspaceRoot, 'logs'),
      metadataJsonPath: metadataPath,
      characterImagePath,
      scriptWorkspaceV2: workspaceRoot,
      scriptMode: 'normal',
    } as any);

    expect(runNpmCommandMock).toHaveBeenCalledTimes(1);
    const [call] = runNpmCommandMock.mock.calls;
    const args: string[] = call[0].args;
    expect(args).not.toContain('--fast');
  });
});
