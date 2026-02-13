import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

import { generateCaptionsOverlay } from '../../scripts/daemon/helpers/captions';

async function createTempDir(prefix: string) {
  return fs.mkdtemp(path.join(tmpdir(), prefix));
}

function setupSpawnMock() {
  spawnMock.mockImplementation((_cmd: string, args: string[]) => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const child = new EventEmitter() as any;
    child.stdout = stdout;
    child.stderr = stderr;

    const separator = args.indexOf('--');
    let outputPath: string | null = null;
    if (separator >= 0) {
      for (let i = separator + 1; i < args.length - 1; i += 1) {
        if (args[i] === '--output') {
          outputPath = args[i + 1];
          break;
        }
      }
    }

    setTimeout(async () => {
      try {
        if (outputPath) {
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, 'dummy');
        }
      } catch {}
      stdout.emit('data', Buffer.from(`Saved ${outputPath ?? ''}`));
      stderr.emit('data', Buffer.from(''));
      child.emit('close', 0);
    }, 0);

    return child;
  });
}

async function createInputJson(baseDir: string) {
  const metadataDir = path.join(baseDir, 'metadata');
  await fs.mkdir(metadataDir, { recursive: true });
  const inputPath = path.join(metadataDir, 'transcript-blocks.json');
  await fs.writeFile(inputPath, JSON.stringify({ blocks: [] }));
  return inputPath;
}

async function cleanupDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

describe('generateCaptionsOverlay', () => {
  const scriptWorkspace = path.resolve('tests/daemon/dummy-scripts/DAEMON_SCRIPT_CAPTION');

  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    spawnMock.mockReset();
  });

  it('uses the python renderer by default', async () => {
    setupSpawnMock();
    const baseDir = await createTempDir('captions-python-');
    try {
      const logDir = path.join(baseDir, 'logs');
      await fs.mkdir(logDir, { recursive: true });
      const inputPath = await createInputJson(baseDir);

      const result = await generateCaptionsOverlay({
        projectId: 'proj',
        workspaceRoot: baseDir,
        logDir,
        scriptCaptionWorkspace: scriptWorkspace,
        inputJsonPath: inputPath,
        preset: 'acid',
      });

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const args = spawnMock.mock.calls[0][1];
      expect(args.slice(0, 3)).toEqual(['run', 'render:python', '--']);
      const outputPath = path.join(baseDir, 'captions-video', 'out-alpha-validated.webm');
      await expect(fs.access(outputPath)).resolves.toBeUndefined();
      expect(result.logPath).toBeTruthy();
      const logContent = await fs.readFile(result.logPath!, 'utf8');
      expect(logContent).toContain('render:python');
    } finally {
      await cleanupDir(baseDir);
    }
  });

  it('supports forcing the legacy renderer', async () => {
    setupSpawnMock();
    const baseDir = await createTempDir('captions-legacy-');
    try {
      const logDir = path.join(baseDir, 'logs');
      await fs.mkdir(logDir, { recursive: true });
      const inputPath = await createInputJson(baseDir);

      const result = await generateCaptionsOverlay({
        projectId: 'proj',
        workspaceRoot: baseDir,
        logDir,
        scriptCaptionWorkspace: scriptWorkspace,
        inputJsonPath: inputPath,
        preset: 'acid',
        renderer: 'legacy',
      });

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const args = spawnMock.mock.calls[0][1];
      expect(args.slice(0, 3)).toEqual(['run', 'render:headless', '--']);
      expect(result.logPath).toBeTruthy();
      const logContent = await fs.readFile(result.logPath!, 'utf8');
      expect(logContent).toContain('render:headless');
    } finally {
      await cleanupDir(baseDir);
    }
  });
});
