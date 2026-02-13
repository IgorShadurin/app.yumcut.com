import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { log } from './logger';
import type { ScriptMode } from './config';
import { formatCommandForCommandsLog, withWorkspaceCommandLog } from './commands-log';

const DEFAULT_SCRIPT_MODE: ScriptMode = 'fast';

function useFakeMetadataCli() {
  return process.env.DAEMON_FAKE_CLI === '1' || process.env.DAEMON_USE_FAKE_CLI === '1';
}

export async function generateMetadata(params: {
  projectId: string;
  workspaceRoot: string;
  commandsWorkspaceRoot?: string | null;
  scriptWorkspaceV2: string;
  logDir: string;
  targetBlockCount?: number | null;
  scriptMode?: ScriptMode | null;
}) {
  const { projectId, workspaceRoot, commandsWorkspaceRoot, scriptWorkspaceV2, logDir, targetBlockCount } = params;
  const scriptMode: ScriptMode = params.scriptMode === 'normal' ? 'normal' : DEFAULT_SCRIPT_MODE;
  const fastModeEnabled = scriptMode === 'fast';
  await fs.mkdir(workspaceRoot, { recursive: true });

  const transcriptPath = path.join(workspaceRoot, 'transcript.txt');
  try {
    await fs.access(transcriptPath);
  } catch (err: any) {
    throw new Error(`Transcript not found for metadata generation at ${transcriptPath}: ${err?.message || err}`);
  }

  const metadataDir = path.join(workspaceRoot, 'metadata');
  await fs.mkdir(metadataDir, { recursive: true });
  const outputPath = path.join(metadataDir, 'transcript-blocks.json');

  await fs.mkdir(logDir, { recursive: true });

  const commandArgs = ['run', 'transcript:json', '--', transcriptPath, outputPath];
  if (fastModeEnabled) {
    commandArgs.push('--fast');
  }
  if (typeof targetBlockCount === 'number' && Number.isFinite(targetBlockCount) && targetBlockCount > 0) {
    const normalizedTargetCount = Math.max(1, Math.floor(targetBlockCount));
    commandArgs.push('--target-blocks', String(normalizedTargetCount));
  }
  const displayCommand = `npm ${commandArgs.map((arg) => (/^[\w@./:+-]+$/u.test(arg) ? arg : JSON.stringify(arg))).join(' ')}`;
  const commandLine = formatCommandForCommandsLog({ cmd: 'npm', args: commandArgs, cwd: scriptWorkspaceV2 });
  log.info('Converting transcript to metadata JSON', {
    projectId,
    command: displayCommand,
    transcriptPath,
    outputPath,
    scriptMode,
  });

  if (useFakeMetadataCli()) {
    const blocks = Array.from({ length: Math.max(1, targetBlockCount ?? 4) }, (_unused, idx) => ({
      id: `block-${idx + 1}`,
      text: `Block ${idx + 1}`,
      start: idx * 1000,
      end: idx * 1000 + 750,
    }));
    const logPath = path.join(logDir, `metadata-${new Date().toISOString().replaceAll(':', '-')}.log`);
    await withWorkspaceCommandLog({
      workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
      commandLine,
      run: async () => {
        await fs.writeFile(outputPath, JSON.stringify({ blocks }, null, 2), 'utf8');
        await fs.writeFile(
          logPath,
          `Command: ${displayCommand}\n[DUMMY] metadata generated for ${blocks.length} blocks\n`,
          'utf8',
        );
      },
    });
    log.info('Metadata generation completed (fake CLI)', { projectId, logPath, outputPath });
    return { logPath, command: displayCommand, outputPath };
  }

  const stamp = new Date().toISOString().replaceAll(':', '-');
  const logPath = path.join(logDir, `metadata-${stamp}.log`);
  const stream = fsSync.createWriteStream(logPath, { flags: 'a' });
  const write = (text: string) => { try { stream.write(text); } catch {} };

  let exitCode: number | null = null;
  await withWorkspaceCommandLog({
    workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
    commandLine,
    run: async () => {
      const child = spawn('npm', commandArgs, {
        cwd: scriptWorkspaceV2,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      write(`Command: ${displayCommand}\n`);
      write(`Transcript: ${transcriptPath}\n`);
      write(`Output: ${outputPath}\n`);
      write(`Started: ${new Date().toISOString()}\n`);
      write('--- STREAM BEGIN ---\n');
      child.stdout.on('data', (c) => write(`[STDOUT] ${c.toString()}`));
      child.stderr.on('data', (c) => write(`[STDERR] ${c.toString()}`));

      try {
        exitCode = await new Promise((resolve, reject) => {
          child.once('error', (err) => reject(err));
          child.once('close', (code) => resolve(code ?? 0));
        });
      } catch (err: any) {
        write(`\n[ERROR] Process failed to spawn or crashed: ${err?.message || String(err)}\n`);
        exitCode = -1;
        throw err;
      } finally {
        write(`\n--- STREAM END ---\n`);
        write(`Finished: ${new Date().toISOString()}\n`);
        write(`Exit code: ${exitCode}\n`);
        try { stream.end(); } catch {}
      }

      if (exitCode !== 0) {
        const error = new Error(`Metadata generation failed with code ${exitCode}`);
        (error as any).command = displayCommand;
        throw error;
      }
    },
  });

  if (exitCode !== 0) {
    const error = new Error(`Metadata generation failed with code ${exitCode}`);
    (error as any).command = displayCommand;
    throw error;
  }

  log.info('Metadata generation completed', { projectId, logPath, outputPath });
  return { logPath, command: displayCommand, outputPath };
}

export async function generateSentenceMetadata(params: {
  projectId: string;
  workspaceRoot: string;
  commandsWorkspaceRoot?: string | null;
  scriptWorkspaceV2: string;
  logDir: string;
  originalScriptPath: string;
}) {
  const { projectId, workspaceRoot, commandsWorkspaceRoot, scriptWorkspaceV2, logDir, originalScriptPath } = params;
  const transcriptPath = path.join(workspaceRoot, 'transcript.txt');
  await Promise.all([fs.access(transcriptPath), fs.access(originalScriptPath)]);

  const metadataDir = path.join(workspaceRoot, 'metadata');
  await fs.mkdir(metadataDir, { recursive: true });
  const outputPath = path.join(metadataDir, 'transcript-sentences.json');
  await fs.mkdir(logDir, { recursive: true });

  const commandArgs = ['run', 'transcript:json', '--', originalScriptPath, transcriptPath, outputPath, '--sentence'];
  const displayCommand = `npm ${commandArgs.map((arg) => (/^[\w@./:+-]+$/u.test(arg) ? arg : JSON.stringify(arg))).join(' ')}`;
  const commandLine = formatCommandForCommandsLog({ cmd: 'npm', args: commandArgs, cwd: scriptWorkspaceV2 });

  log.info('Generating sentence-aligned transcript metadata', {
    projectId,
    command: displayCommand,
    originalScriptPath,
    transcriptPath,
    outputPath,
  });

  if (useFakeMetadataCli()) {
    const logPath = path.join(logDir, `metadata-sentences-${new Date().toISOString().replaceAll(':', '-')}.log`);
    await withWorkspaceCommandLog({
      workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
      commandLine,
      run: async () => {
        await fs.writeFile(
          outputPath,
          JSON.stringify({ blocks: [], transcription: await fs.readFile(transcriptPath, 'utf8'), text: await fs.readFile(originalScriptPath, 'utf8') }, null, 2),
          'utf8',
        );
        await fs.writeFile(
          logPath,
          `Command: ${displayCommand}\n[DUMMY] sentence metadata generated\n`,
          'utf8',
        );
      },
    });
    log.info('Sentence metadata generation completed (fake CLI)', { projectId, logPath, outputPath });
    return { logPath, command: displayCommand, outputPath };
  }

  const stamp = new Date().toISOString().replaceAll(':', '-');
  const logPath = path.join(logDir, `metadata-sentences-${stamp}.log`);
  const stream = fsSync.createWriteStream(logPath, { flags: 'a' });
  const write = (text: string) => {
    try {
      stream.write(text);
    } catch {}
  };
  write(`Command: ${displayCommand}\n`);
  write(`Original script: ${originalScriptPath}\n`);
  write(`Transcript: ${transcriptPath}\n`);
  write(`Output: ${outputPath}\n`);
  write(`Started: ${new Date().toISOString()}\n`);
  write('--- STREAM BEGIN ---\n');

  let exitCode: number | null = null;
  await withWorkspaceCommandLog({
    workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
    commandLine,
    run: async () => {
      const child = spawn('npm', commandArgs, {
        cwd: scriptWorkspaceV2,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (c) => write(`[STDOUT] ${c.toString()}`));
      child.stderr.on('data', (c) => write(`[STDERR] ${c.toString()}`));

      try {
        exitCode = await new Promise((resolve, reject) => {
          child.once('error', (err) => reject(err));
          child.once('close', (code) => resolve(code ?? 0));
        });
      } catch (err: any) {
        write(`\n[ERROR] Process failed to spawn or crashed: ${err?.message || String(err)}\n`);
        exitCode = -1;
        throw err;
      } finally {
        write(`\n--- STREAM END ---\n`);
        write(`Finished: ${new Date().toISOString()}\n`);
        write(`Exit code: ${exitCode}\n`);
        try {
          stream.end();
        } catch {}
      }

      if (exitCode !== 0) {
        const error = new Error(`Sentence metadata generation failed with code ${exitCode}`);
        (error as any).command = displayCommand;
        throw error;
      }
    },
  });

  if (exitCode !== 0) {
    const error = new Error(`Sentence metadata generation failed with code ${exitCode}`);
    (error as any).command = displayCommand;
    throw error;
  }

  log.info('Sentence metadata generation completed', { projectId, logPath, outputPath });
  return { logPath, command: displayCommand, outputPath };
}
