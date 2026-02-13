import path from 'path';
import { promises as fs } from 'fs';

type CommandStatus = 'done' | 'fail';

export type WorkspaceCommandLogHandle = {
  done: () => Promise<void>;
  fail: () => Promise<void>;
};

const writeQueues = new Map<string, Promise<void>>();
const ALLOWED_ARG_PATTERN = /^[\w@./:+-]+$/u;

function quoteForShell(value: string): string {
  if (ALLOWED_ARG_PATTERN.test(value)) return value;
  return JSON.stringify(value);
}

function enqueueWrite(filePath: string, task: () => Promise<void>): Promise<void> {
  const prev = writeQueues.get(filePath) ?? Promise.resolve();
  const next = prev.then(task, task);
  writeQueues.set(
    filePath,
    next.finally(() => {
      if (writeQueues.get(filePath) === next) writeQueues.delete(filePath);
    }),
  );
  return next;
}

function resolveCommandsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'commands.txt');
}

function detectNodeVersion(): string | null {
  return typeof process?.version === 'string' && process.version ? process.version : null;
}

function detectNpmVersion(): string | null {
  const ua = process.env.npm_config_user_agent;
  if (!ua) return null;
  const match = /(?:^|\s)npm\/([0-9]+(?:\.[0-9]+){0,2})/i.exec(ua);
  return match?.[1] ?? null;
}

export function formatCommandForCommandsLog(params: { cmd: string; args: string[]; cwd?: string | null }): string {
  const { cmd, args, cwd } = params;
  const base = `${cmd} ${args.map(quoteForShell).join(' ')}`.trim();
  const cdPrefix = cwd ? `cd ${quoteForShell(cwd)} && ` : '';

  const nodeVersion = detectNodeVersion();
  const npmVersion = cmd === 'npm' || cmd === 'npx' ? detectNpmVersion() : null;
  const versions: string[] = [];
  if (nodeVersion) versions.push(`node=${nodeVersion.replace(/^v/u, '')}`);
  if (npmVersion) versions.push(`npm=${npmVersion}`);

  const suffix = versions.length > 0 ? ` [${versions.join(' ')}]` : '';
  return `${cdPrefix}${base}${suffix}`;
}

export async function beginWorkspaceCommandLog(workspaceRoot: string, commandLine: string): Promise<WorkspaceCommandLogHandle> {
  const commandsPath = resolveCommandsPath(workspaceRoot);
  const header = `${commandLine.trimEnd()}\n`;

  await enqueueWrite(commandsPath, async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.appendFile(commandsPath, header, 'utf8');
  });

  let finalized = false;
  const finalize = async (status: CommandStatus) => {
    if (finalized) return;
    finalized = true;
    const tail =
      status === 'done'
        ? `✅ DONE\n\n`
        : `❌ FAIL\n----\n\n`;
    await enqueueWrite(commandsPath, async () => {
      await fs.appendFile(commandsPath, tail, 'utf8');
    });
  };

  return {
    done: () => finalize('done'),
    fail: () => finalize('fail'),
  };
}

export async function withWorkspaceCommandLog<T>(params: {
  workspaceRoot?: string | null;
  commandLine: string;
  run: () => Promise<T>;
}): Promise<T> {
  const { workspaceRoot, commandLine, run } = params;
  if (!workspaceRoot) {
    return run();
  }

  const handle = await beginWorkspaceCommandLog(workspaceRoot, commandLine);
  try {
    const result = await run();
    await handle.done();
    return result;
  } catch (err) {
    await handle.fail();
    throw err;
  }
}

