import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { generateMetadata, generateSentenceMetadata } from '../../scripts/daemon/helpers/metadata';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

function setupSpawnMock(exitCode = 0) {
  spawnMock.mockImplementation((_cmd, args: string[]) => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const child = new EventEmitter() as any;
    child.stdout = stdout;
    child.stderr = stderr;

    const separatorIndex = args.indexOf('--');
    const outputPath = (() => {
      if (separatorIndex < 0) return null;
      const isSentence = args.includes('--sentence');
      const positionalIndex = isSentence ? separatorIndex + 3 : separatorIndex + 2;
      return args[positionalIndex] ?? null;
    })();
    const targetsIndex = args.indexOf('--target-blocks');
    const targetCount = targetsIndex >= 0 ? Number(args[targetsIndex + 1]) : undefined;

    setTimeout(async () => {
      try {
        if (outputPath) {
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          const blocks = Array.from(
            { length: Number.isFinite(targetCount) && targetCount ? targetCount : 4 },
            (_unused, idx) => ({
              id: `b${idx + 1}`,
              text: `Block ${idx + 1}`,
              start: idx * 1000,
              end: idx * 1000 + 500,
            }),
          );
          await fs.writeFile(outputPath, JSON.stringify({ blocks }), 'utf8');
        }
      } catch {
        /* ignore */
      }
      stdout.emit('data', Buffer.from('ok'));
      stderr.emit('data', Buffer.from(''));
      child.emit('close', exitCode);
    }, 0);

    return child;
  });
}

describe('generateMetadata', () => {
  let baseDir: string;
  let workspaceRoot: string;
  let logDir: string;

  beforeEach(async () => {
    spawnMock.mockReset();
    baseDir = await fs.mkdtemp(path.join(tmpdir(), 'metadata-helper-'));
    workspaceRoot = path.join(baseDir, 'lang');
    logDir = path.join(baseDir, 'logs');
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.mkdir(logDir, { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'transcript.txt'), 'demo transcript', 'utf8');
  });

  afterEach(async () => {
    try {
      await fs.rm(baseDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('passes target block count to the CLI when provided', async () => {
    setupSpawnMock();

    const result = await generateMetadata({
      projectId: 'proj',
      workspaceRoot,
      scriptWorkspaceV2: workspaceRoot,
      logDir,
      targetBlockCount: 7,
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const args = spawnMock.mock.calls[0][1];
    expect(args).toContain('--fast');
    const flagIndex = args.indexOf('--target-blocks');
    expect(flagIndex).toBeGreaterThan(-1);
    expect(args[flagIndex + 1]).toBe('7');

    const output = JSON.parse(await fs.readFile(result.outputPath, 'utf8'));
    expect(Array.isArray(output.blocks)).toBe(true);
    expect(output.blocks).toHaveLength(7);
  });

  it('skips fast mode flag when scriptMode is normal', async () => {
    setupSpawnMock();

    await generateMetadata({
      projectId: 'proj',
      workspaceRoot,
      scriptWorkspaceV2: workspaceRoot,
      logDir,
      targetBlockCount: null,
      scriptMode: 'normal',
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const args = spawnMock.mock.calls[0][1];
    expect(args).not.toContain('--fast');
  });

  it('generates sentence metadata with original script and transcript paths', async () => {
    setupSpawnMock();
    const originalScriptPath = path.join(workspaceRoot, 'template-original.txt');
    await fs.writeFile(originalScriptPath, 'Original text body.', 'utf8');

    const result = await generateSentenceMetadata({
      projectId: 'proj',
      workspaceRoot,
      scriptWorkspaceV2: workspaceRoot,
      logDir,
      originalScriptPath,
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const args = spawnMock.mock.calls[0][1];
    expect(args).toContain('--sentence');
    const separatorIndex = args.indexOf('--');
    expect(args[separatorIndex + 1]).toBe(originalScriptPath);
    expect(args[separatorIndex + 2]).toBe(path.join(workspaceRoot, 'transcript.txt'));
    expect(args[separatorIndex + 3]).toBe(path.join(workspaceRoot, 'metadata', 'transcript-sentences.json'));
    expect(result.outputPath).toBe(path.join(workspaceRoot, 'metadata', 'transcript-sentences.json'));
  });
});
