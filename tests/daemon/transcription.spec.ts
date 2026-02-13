import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

import { transcribeAudio } from '../../scripts/daemon/helpers/transcription';

function setupSpawnMock(exitCode = 0) {
  spawnMock.mockImplementation((_cmd, args: string[]) => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const child = new EventEmitter() as any;
    child.stdout = stdout;
    child.stderr = stderr;

    const separatorIndex = args.indexOf('--');
    const outputPath = separatorIndex >= 0 ? args[separatorIndex + 2] : null;

    setTimeout(async () => {
      try {
        if (outputPath) {
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, 'demo transcript');
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

async function createTempDir(prefix: string) {
  return fs.mkdtemp(path.join(tmpdir(), prefix));
}

describe('transcribeAudio', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    spawnMock.mockReset();
  });

  it('passes audio and output paths to the v2 transcriber and writes transcripts to the language directory', async () => {
    setupSpawnMock();

    const baseDir = await createTempDir('transcribe-audio-');
    const workspaceDir = path.join(baseDir, 'lang');
    const logDir = path.join(baseDir, 'logs');
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(logDir, { recursive: true });
    await fs.writeFile(path.join(workspaceDir, 'existing.txt'), 'stale');
    const audioPath = path.join(baseDir, 'voice.wav');
    await fs.writeFile(audioPath, 'wave');

    const result = await transcribeAudio({
      projectId: 'proj',
      audioPath,
      workspaceRoot: workspaceDir,
      logDir,
      scriptWorkspaceV2: workspaceDir,
      languageCode: 'en',
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const args = spawnMock.mock.calls[0][1];
    expect(args.slice(0, 2)).toEqual(['run', 'audio:transcribe:faster-whisper']);
    const separatorIndex = args.indexOf('--');
    expect(separatorIndex).toBeGreaterThan(-1);
    const audioArg = args[separatorIndex + 1];
    const outputArg = args[separatorIndex + 2];
    expect(audioArg).toBe(audioPath);
    expect(outputArg).toBe(path.join(workspaceDir, 'transcript.txt'));
    expect(args).toContain('--language');
    const languageArgIndex = args.indexOf('--language');
    expect(args[languageArgIndex + 1]).toBe('en');

    const transcriptPath = path.join(workspaceDir, 'transcript.txt');
    const exists = await fs.stat(transcriptPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const logPath = result.logPath;
    expect(logPath.startsWith(path.join(logDir, 'transcription-'))).toBe(true);
    const logContents = await fs.readFile(logPath, 'utf8');
    expect(logContents).toContain(`audio:transcribe:faster-whisper`);
  });

  it('overwrites previous transcripts with the latest run', async () => {
    setupSpawnMock();

    const baseDir = await createTempDir('transcribe-audio-overwrite-');
    const workspaceDir = path.join(baseDir, 'lang');
    const logDir = path.join(baseDir, 'logs');
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.writeFile(path.join(workspaceDir, 'transcript.txt'), 'old');
    await fs.mkdir(logDir, { recursive: true });
    const audioPath = path.join(baseDir, 'voice.wav');
    await fs.writeFile(audioPath, 'wave');

    await transcribeAudio({
      projectId: 'proj',
      audioPath,
      workspaceRoot: workspaceDir,
      logDir,
      scriptWorkspaceV2: workspaceDir,
      languageCode: 'en',
    });

    const transcriptPath = path.join(workspaceDir, 'transcript.txt');
    const contents = await fs.readFile(transcriptPath, 'utf8');
    expect(contents).toBe('demo transcript');
  });
});
