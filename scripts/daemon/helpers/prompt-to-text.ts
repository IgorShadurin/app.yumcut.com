import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { loadConfig } from './config';
import { log } from './logger';
import { formatCommandForCommandsLog, withWorkspaceCommandLog } from './commands-log';

const cfg = loadConfig();

type BaseOptions = {
  durationSeconds?: number | null;
  language?: string | null;
  workspaceRoot?: string | null;
};

type GenerateOptions = BaseOptions & {
  prompt: string;
  mustHave?: string;
  avoid?: string;
};

type RefineOptions = BaseOptions & {
  script: string;
  instructions: string;
};

function sanitizeOutput(output: string) {
  return output.replace(/\r/g, '').trim();
}

function extractScriptText(raw: string) {
  if (!raw) return raw;
  const lines = raw.split('\n');
  const markerIndex = lines.findIndex((line) => line.trim() === '--- Script Output ---');
  const contentLines = markerIndex >= 0 ? lines.slice(markerIndex + 1) : lines;
  const trimmedLeading = contentLines.slice();
  while (trimmedLeading.length > 0 && trimmedLeading[0].trim().length === 0) {
    trimmedLeading.shift();
  }
  return trimmedLeading.join('\n').trim();
}

function quoteArg(value: string) {
  if (/^[\w@./:+-]+$/u.test(value)) return value;
  return JSON.stringify(value);
}

function useFakePromptCli() {
  return process.env.DAEMON_FAKE_CLI === '1' || process.env.DAEMON_USE_FAKE_CLI === '1';
}

type CliInvocation = {
  prompt?: string | null;
  scriptFile?: string | null;
  instructions?: string | null;
  duration?: number | null;
  language?: string | null;
  mustHave?: string | null;
  avoid?: string | null;
};

function repeatToLength(base: string, targetLen: number): string {
  if (base.length >= targetLen) return base.slice(0, targetLen);
  const chunks: string[] = [];
  while (chunks.join('').length < targetLen) chunks.push(base);
  return chunks.join('').slice(0, targetLen);
}

function toNumber(value: string | null | undefined, fallback = 0) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function fakePromptToText(args: string[]): Promise<string> {
  const flags: CliInvocation = {};
  const consumeValue = (flag: string) => {
    const idx = args.indexOf(flag);
    if (idx >= 0 && typeof args[idx + 1] === 'string') {
      return args[idx + 1] as string;
    }
    return null;
  };
  flags.prompt = consumeValue('--prompt');
  flags.scriptFile = consumeValue('--script-file');
  flags.instructions = consumeValue('--refine');
  const durationRaw = consumeValue('--duration');
  flags.duration = durationRaw ? Number(durationRaw) || null : null;
  flags.language = consumeValue('--language');
  flags.mustHave = consumeValue('--must-have');
  flags.avoid = consumeValue('--avoid');

  const shouldFail = process.env.YUMCUT_DUMMY_FAIL_PROMPT_TO_TEXT === '1';
  if (shouldFail) {
    throw new Error('Forced failure via YUMCUT_DUMMY_FAIL_PROMPT_TO_TEXT');
  }

  const forcedText = process.env.YUMCUT_DUMMY_TEXT;
  const mode = flags.scriptFile && flags.instructions ? 'refine' : 'generate';
  let sourceText = '';
  if (mode === 'refine' && flags.scriptFile) {
    try {
      sourceText = await fs.readFile(flags.scriptFile, 'utf8');
    } catch (err: any) {
      throw new Error(`Unable to read script file: ${err?.message || err}`);
    }
  } else if (flags.prompt) {
    sourceText = flags.prompt;
  }
  sourceText = sourceText.trim();

  if (mode === 'refine' && (!flags.instructions || !flags.instructions.trim())) {
    throw new Error('Missing refinement instructions');
  }

  if (!sourceText) {
    throw new Error(mode === 'refine' ? 'Script is empty' : 'Prompt is required for script generation');
  }

  const baseOutput = forcedText != null
    ? forcedText
    : mode === 'refine'
      ? `REFINED(${flags.instructions?.slice(0, 60) ?? ''}) :: ${sourceText}`
      : `DUMMY TEXT FOR PROMPT: ${sourceText}`;

  const delayMs = toNumber(process.env.YUMCUT_PROMPT_STUB_DELAY_MS || process.env.YUMCUT_DUMMY_DELAY_MS, 0);
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return repeatToLength(`${baseOutput}\n`, 1000);
}

async function runPromptToText(workspaceRoot: string | null | undefined, args: string[]) {
  // Build a preview for logs without mutating real args; clearly indicate truncation.
  const previewArgs = args.map((value) => {
    if (value.startsWith('--')) return value;
    if (value.length <= 200) return value;
    return `${value.slice(0, 160)}…${value.slice(-40)}`;
  });
  const promptIndex = args.findIndex((a) => a === '--prompt');
  const promptChars = promptIndex >= 0 && typeof args[promptIndex + 1] === 'string' ? (args[promptIndex + 1] as string).length : undefined;
  const npmArgs = ['run', 'prompt-to-text', '--', ...args];
  const commandLine = formatCommandForCommandsLog({ cmd: 'npm', args: npmArgs, cwd: cfg.scriptWorkspace });
  return withWorkspaceCommandLog({
    workspaceRoot,
    commandLine,
    run: async () =>
      useFakePromptCli()
        ? fakePromptToText(args)
        : new Promise<string>((resolve, reject) => {
            log.info('Running prompt-to-text script', { cwd: cfg.scriptWorkspace, argsPreview: previewArgs, promptChars });
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
              reject(new Error(`Failed to start prompt-to-text script: ${err?.message || err}`));
            });
            child.once('close', (code) => {
              if (code !== 0) {
                const message = stderr.trim() || stdout.trim() || `Prompt-to-text script exited with code ${code}`;
                log.error('Prompt-to-text script failed', { code, stderr: stderr.slice(-2000) });
                reject(new Error(message));
                return;
              }
              const cleaned = sanitizeOutput(stdout);
              const extracted = extractScriptText(cleaned);
              if (!cleaned) {
                const errMessage = stderr.trim() || 'Prompt-to-text script produced no output';
                reject(new Error(errMessage));
                return;
              }
              if (!extracted) {
                resolve(cleaned);
                return;
              }
              resolve(extracted);
            });
          }),
  });
}

async function withTempScriptFile(content: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-to-text-'));
  const filePath = path.join(dir, `${randomBytes(6).toString('hex')}.txt`);
  await fs.writeFile(filePath, content, 'utf8');
  async function cleanup() {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (err) {
      log.warn('Failed to clean up temp prompt-to-text file', { error: (err as any)?.message || String(err) });
    }
  }
  return { filePath, cleanup };
}

export class PromptToTextError extends Error {
  command: string;

  constructor(message: string, command: string) {
    super(message);
    this.name = 'PromptToTextError';
    this.command = command;
  }
}

export type PromptToTextResult = {
  text: string;
  command: string;
  args: string[];
};

export async function generateScript(options: GenerateOptions): Promise<PromptToTextResult> {
  const { prompt, durationSeconds, mustHave, avoid, language, workspaceRoot } = options;
  const args = ['--prompt', prompt];
  if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    args.push('--duration', String(Math.round(durationSeconds)));
  }
  if (mustHave && mustHave.trim()) {
    args.push('--must-have', mustHave.trim());
  }
  if (avoid && avoid.trim()) {
    args.push('--avoid', avoid.trim());
  }
  if (language && language.trim()) {
    args.push('--language', language.trim());
  }
  const command = `npm run prompt-to-text -- ${args.map((arg) => quoteArg(arg)).join(' ')}`;
  try {
    const text = await runPromptToText(workspaceRoot, args);
    return { text, command, args };
  } catch (err: any) {
    const message = err?.message || String(err);
    throw new PromptToTextError(message, command);
  }
}

export async function refineScript(options: RefineOptions): Promise<PromptToTextResult> {
  const { script, instructions, durationSeconds, workspaceRoot } = options;
  const { filePath, cleanup } = await withTempScriptFile(script);
  try {
    const args = ['--script-file', filePath, '--refine', instructions];
    if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0) {
      args.push('--duration', String(Math.round(durationSeconds)));
    }
    // The prompt-to-text CLI rejects --language when refining an existing script.
    // See error: "The --must-have, --avoid, and --language options are only supported when generating a new script."
    const command = `npm run prompt-to-text -- ${args.map((arg) => quoteArg(arg)).join(' ')}`;
    try {
      const text = await runPromptToText(workspaceRoot, args);
      return { text, command, args };
    } catch (err: any) {
      const message = err?.message || String(err);
      throw new PromptToTextError(message, command);
    }
  } finally {
    await cleanup();
  }
}
