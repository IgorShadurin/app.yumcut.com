import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { DEFAULT_LANGUAGE, TargetLanguageCode } from '@/shared/constants/languages';
import { log } from './logger';
import { isDummyScriptWorkspace } from './dummy-fallbacks';
import { formatCommandForCommandsLog, withWorkspaceCommandLog } from './commands-log';

export async function transcribeAudio(params: {
  projectId: string;
  audioPath: string;
  workspaceRoot: string;
  commandsWorkspaceRoot?: string | null;
  logDir: string;
  scriptWorkspaceV2: string;
  languageCode?: string | null;
}) {
  const { projectId, audioPath, workspaceRoot, commandsWorkspaceRoot, logDir, scriptWorkspaceV2, languageCode } = params;
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(logDir, { recursive: true });

  const outputPath = path.join(workspaceRoot, 'transcript.txt');
  await fs.rm(outputPath, { force: true }).catch(() => {});

  const normalizedLanguage = typeof languageCode === 'string' ? languageCode.trim().toLowerCase() : '';
  const shortLanguage = /^[a-z]{2}$/u.test(normalizedLanguage) ? (normalizedLanguage as TargetLanguageCode) : DEFAULT_LANGUAGE;
  const commandArgs = ['run', 'audio:transcribe:faster-whisper', '--', audioPath, outputPath, '--language', shortLanguage];
  const displayCommand = `npm ${commandArgs.map((arg) => (/^[\w@./:+-]+$/u.test(arg) ? arg : JSON.stringify(arg))).join(' ')}`;
  const commandLine = formatCommandForCommandsLog({ cmd: 'npm', args: commandArgs, cwd: scriptWorkspaceV2 });

  if (isDummyScriptWorkspace(scriptWorkspaceV2)) {
    const logPath = path.join(logDir, `transcription-${new Date().toISOString().replaceAll(':', '-')}.log`);
    await withWorkspaceCommandLog({
      workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
      commandLine,
      run: async () => {
        await fs.writeFile(outputPath, 'dummy transcript');
        await fs.writeFile(logPath, `Command: ${displayCommand}\n[DUMMY] transcript generated`, 'utf8');
      },
    });
    log.info('Transcription completed (dummy workspace)', { projectId, logPath });
    return { logPath, command: displayCommand };
  }

  log.info('Running transcription agent', { projectId, command: displayCommand, output: outputPath });

  let stdout = '';
  let stderr = '';
  const exitCode: number = await withWorkspaceCommandLog({
    workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
    commandLine,
    run: async () => {
      const child = spawn('npm', commandArgs, {
        cwd: scriptWorkspaceV2,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      return new Promise((resolve, reject) => {
        child.once('error', (err) => reject(err));
        child.once('close', (code) => resolve(code ?? 0));
      });
    },
  });

  const stamp = new Date().toISOString().replaceAll(':', '-');
  const logPath = path.join(logDir, `transcription-${stamp}.log`);
  const content = [
    `Command: ${displayCommand}`,
    '\n--- STDOUT ---\n',
    stdout.trim(),
    '\n--- STDERR ---\n',
    stderr.trim(),
    `\nExit code: ${exitCode}`,
  ].join('');
  await fs.writeFile(logPath, content, 'utf8');

  if (exitCode !== 0) {
    const error = new Error(`Transcription failed with code ${exitCode}`);
    (error as any).stdout = stdout;
    (error as any).stderr = stderr;
    (error as any).command = displayCommand;
    throw error;
  }

  log.info('Transcription completed', { projectId, logPath });
  return { logPath, command: displayCommand };
}
