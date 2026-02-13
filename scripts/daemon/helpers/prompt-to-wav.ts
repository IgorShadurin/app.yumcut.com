import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { loadConfig } from './config';
import { log } from './logger';
import { formatCommandForCommandsLog, withWorkspaceCommandLog } from './commands-log';

const cfg = loadConfig();
function useFakeAudioCli() {
  return process.env.DAEMON_FAKE_CLI === '1' || process.env.DAEMON_USE_FAKE_CLI === '1';
}

type SupportedVoiceProvider = 'minimax' | 'elevenlabs' | 'inworld';

function normalizeProvider(value: string | null | undefined): SupportedVoiceProvider | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'minimax' || normalized === 'elevenlabs' || normalized === 'inworld') return normalized;
  return null;
}

export type GenerateVoiceoverOptions = {
  projectId: string;
  languageCode: string;
  languageWorkspace: string;
  commandsWorkspaceRoot?: string | null;
  text: string;
  takeCount: number;
  voice?: string | null;
  voiceProvider?: string | null;
  style?: string | null;
};

export type GenerateVoiceoverResult = {
  runDirectory: string;
  outputs: { path: string; take: number }[];
  error?: Error;
};

function sanitizeArgsText(value: string) {
  if (value.length <= 120) return value;
  if (value.length > 200) {
    const head = value.slice(0, 80);
    const tail = value.slice(-60);
    return `${head}…${tail}`;
  }
  return `${value.slice(0, 100)}…${value.slice(-20)}`;
}

async function runLegacyPromptToWav(workspaceRoot: string, args: string[]) {
  const preview = args.map((arg) => (arg.startsWith('--') ? arg : sanitizeArgsText(arg)));
  const npmArgs = ['run', 'prompt-to-wav', '--', ...args];
  const commandLine = formatCommandForCommandsLog({ cmd: 'npm', args: npmArgs, cwd: cfg.scriptWorkspace });
  return withWorkspaceCommandLog({
    workspaceRoot,
    commandLine,
    run: async () =>
      useFakeAudioCli()
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
        log.info('Running prompt-to-wav script', { cwd: cfg.scriptWorkspace, args: preview });
        const child = spawn('npm', npmArgs, {
          cwd: cfg.scriptWorkspace,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        child.once('error', (err) => {
          reject(new Error(`Failed to start prompt-to-wav script: ${err?.message || err}`));
        });
        child.once('close', (code) => {
          if (code !== 0) {
            const message = stderr.trim() || stdout.trim() || `Prompt-to-wav script exited with code ${code}`;
            log.error('Prompt-to-wav script failed', { code, stderr: stderr.slice(-2000) });
            reject(new Error(message));
            return;
          }
          resolve();
        });
      }),
  });
}

async function runMinimaxPromptToWav(workspaceRoot: string, args: string[]) {
  const preview = args.map((arg) => (arg.startsWith('--') ? arg : sanitizeArgsText(arg)));
  const npmArgs = ['run', 'audio:minimax', '--', ...args];
  const commandLine = formatCommandForCommandsLog({ cmd: 'npm', args: npmArgs, cwd: cfg.scriptWorkspaceV2 });
  return withWorkspaceCommandLog({
    workspaceRoot,
    commandLine,
    run: async () =>
      useFakeAudioCli()
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
        log.info('Running MiniMax audio CLI', { cwd: cfg.scriptWorkspaceV2, args: preview });
        const child = spawn('npm', npmArgs, {
          cwd: cfg.scriptWorkspaceV2,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        child.once('error', (err) => {
          reject(new Error(`Failed to start MiniMax audio CLI: ${err?.message || err}`));
        });
        child.once('close', (code) => {
          if (code !== 0) {
            const message = stderr.trim() || stdout.trim() || `MiniMax audio CLI exited with code ${code}`;
            log.error('MiniMax audio CLI failed', { code, stderr: stderr.slice(-2000) });
            reject(new Error(message));
            return;
          }
          resolve();
        });
      }),
  });
}

async function runInworldPromptToWav(workspaceRoot: string, args: string[]) {
  const preview = args.map((arg) => (arg.startsWith('--') ? arg : sanitizeArgsText(arg)));
  const npmArgs = ['run', 'audio:inworld', '--', ...args];
  const commandLine = formatCommandForCommandsLog({ cmd: 'npm', args: npmArgs, cwd: cfg.scriptWorkspaceV2 });
  return withWorkspaceCommandLog({
    workspaceRoot,
    commandLine,
    run: async () =>
      useFakeAudioCli()
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
        log.info('Running Inworld audio CLI', { cwd: cfg.scriptWorkspaceV2, args: preview });
        const child = spawn('npm', npmArgs, {
          cwd: cfg.scriptWorkspaceV2,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
        child.once('error', (err) => {
          reject(new Error(`Failed to start Inworld audio CLI: ${err?.message || err}`));
        });
        child.once('close', (code) => {
          if (code !== 0) {
            const message = stderr.trim() || stdout.trim() || `Inworld audio CLI exited with code ${code}`;
            log.error('Inworld audio CLI failed', { code, stderr: stderr.slice(-2000) });
            reject(new Error(message));
            return;
          }
          resolve();
        });
      }),
  });
}

async function ensureDir(target: string) {
  await fs.mkdir(target, { recursive: true });
}

function buildRunDirectory(languageWorkspace: string) {
  const audioBase = path.join(languageWorkspace, 'audio');
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const runId = `${stamp}-${randomBytes(3).toString('hex')}`;
  return {
    audioBase,
    runDir: path.join(audioBase, runId),
    runId,
  };
}

export async function generateVoiceovers(options: GenerateVoiceoverOptions): Promise<GenerateVoiceoverResult> {
  const { projectId, languageCode, languageWorkspace, commandsWorkspaceRoot, text, takeCount, voice, voiceProvider, style } = options;
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Script text for audio generation is empty');
  }
  const resolvedProvider = normalizeProvider(voiceProvider);
  if (!resolvedProvider) {
    throw new Error(
      `Voice provider is required for ${voice || 'selected voice'}. Supported providers: MiniMax, Inworld, ElevenLabs.`,
    );
  }

  const effectiveTakes = Math.min(Math.max(takeCount, 1), 3);
  const trimmedVoice = typeof voice === 'string' ? voice.trim() : '';
  let resolvedVoice = trimmedVoice.length > 0 ? trimmedVoice : null;
  if (!resolvedVoice && resolvedProvider === 'minimax') {
    const fallback = cfg.audioDefaultVoice?.trim();
    if (fallback) {
      resolvedVoice = fallback;
    }
  } else if (!resolvedVoice && (resolvedProvider === 'elevenlabs' || resolvedProvider === 'inworld')) {
    const fallback = cfg.audioDefaultVoice?.trim();
    if (fallback) {
      resolvedVoice = fallback;
    }
  }
  if (!resolvedVoice) {
    throw new Error(`No voice id available for ${resolvedProvider} provider`);
  }

  const requestedStyle = typeof style === 'string' && style.trim().length > 0 ? style.trim() : null;
  const configStyle = cfg.audioDefaultStyle && cfg.audioDefaultStyle.trim().length > 0 ? cfg.audioDefaultStyle.trim() : null;
  const supportsStyle = resolvedProvider === 'elevenlabs';
  const resolvedStyle = supportsStyle ? requestedStyle ?? configStyle : null;

  const runCli =
    resolvedProvider === 'elevenlabs' ? runLegacyPromptToWav : resolvedProvider === 'minimax' ? runMinimaxPromptToWav : runInworldPromptToWav;

  const effectiveCommandsRoot = commandsWorkspaceRoot ?? path.dirname(languageWorkspace);

  const { audioBase, runDir, runId } = buildRunDirectory(languageWorkspace);
  await ensureDir(audioBase);
  await ensureDir(runDir);

  const scriptPath = path.join(runDir, 'script.txt');
  await fs.writeFile(scriptPath, trimmed, 'utf8');

  const outputs: { path: string; take: number }[] = [];
  const args = [
    '--text-file',
    scriptPath,
    '--voice',
    resolvedVoice,
    '--retries',
    '10',
    '--timeout-ms',
    String(20 * 60 * 1000),
  ];
  for (let i = 0; i < effectiveTakes; i += 1) {
    const take = i + 1;
    const outputPath = path.join(runDir, `take-${take}.wav`);
    outputs.push({ path: outputPath, take });
    args.push('--output', outputPath);
  }
  if (resolvedStyle) {
    args.push('--style', resolvedStyle);
  }

  log.info('Prepared audio generation run directory', {
    projectId,
    languageCode,
    runId,
    runDir,
    takes: outputs.length,
    voice: resolvedVoice,
    hasStyle: !!resolvedStyle,
    voiceProvider: resolvedProvider,
  });

  let partialError: Error | null = null;
  if (useFakeAudioCli()) {
    for (const output of outputs) {
      const payload = `${resolvedVoice || 'voice'}|${resolvedStyle || ''}|${languageCode}|${output.take}|${resolvedProvider}`;
      const header = Buffer.from('RIFF$WAVEfmt ', 'ascii');
      await fs.writeFile(output.path, Buffer.concat([header, Buffer.from(payload, 'utf8')]));
      const sidecar = [
        `Generated for: ${resolvedVoice || 'voice'}`,
        `Style: ${resolvedStyle || ''}`,
        `Provider: ${resolvedProvider}`,
        `Language: ${languageCode}`,
        `Take: ${output.take}`,
        '',
        trimmed,
      ].join('\n');
      try {
        await fs.writeFile(`${output.path}.txt`, sidecar, 'utf8');
      } catch {}
    }
  } else {
    try {
    await runCli(effectiveCommandsRoot, args);
    } catch (err: any) {
      partialError = err instanceof Error ? err : new Error(String(err));
    }
  }

  const realized: { path: string; take: number }[] = [];
  for (const output of outputs) {
    try {
      await fs.stat(output.path);
      realized.push(output);
    } catch (err: any) {
      log.warn('Audio take missing after generation', {
        projectId,
        take: output.take,
        path: output.path,
        error: err?.message || String(err),
      });
    }
  }

  if (realized.length === 0) {
    if (partialError) {
      throw partialError;
    }
    throw new Error('Prompt-to-wav completed but no audio files were created');
  }

  if (realized.length !== outputs.length || partialError) {
    log.warn('Partial audio generation detected', {
      projectId,
      expectedTakes: outputs.length,
      realizedTakes: realized.length,
      error: partialError?.message,
    });
  }

  return {
    runDirectory: runDir,
    outputs: realized,
    ...(partialError ? { error: partialError } : {}),
  } as GenerateVoiceoverResult & { error?: Error };
}
