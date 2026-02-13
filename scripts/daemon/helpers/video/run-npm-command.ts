import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { formatCommandForCommandsLog, withWorkspaceCommandLog } from '../commands-log';

type RunNpmCommandOptions = {
  projectId: string;
  workspaceRoot?: string | null;
  cwd: string;
  args: string[];
  logDir: string;
  logName: string;
};

const ALLOWED_ARG_PATTERN = /^[\w@./:+-]+$/u;

function useFakeVideoCli() {
  return process.env.DAEMON_FAKE_CLI === '1' || process.env.DAEMON_USE_FAKE_CLI === '1';
}

function formatArg(arg: string): string {
  return ALLOWED_ARG_PATTERN.test(arg) ? arg : JSON.stringify(arg);
}

export async function runNpmCommand(options: RunNpmCommandOptions): Promise<{ logPath: string; displayCommand: string }> {
  const { projectId, cwd, args, logDir, logName, workspaceRoot } = options;
  await fs.mkdir(logDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const logPath = path.join(logDir, `${logName}-${stamp}.log`);
  const displayCommand = `npm ${args.map(formatArg).join(' ')}`;
  const commandLine = formatCommandForCommandsLog({ cmd: 'npm', args, cwd });

  return withWorkspaceCommandLog({
    workspaceRoot,
    commandLine,
    run: async () => {
      if (useFakeVideoCli()) {
        await fs.writeFile(
          logPath,
          `Command: ${displayCommand}\nProject: ${projectId}\n[DUMMY] ${logName} completed\n`,
          'utf8',
        );
        return { logPath, displayCommand };
      }

      const child = spawn('npm', args, {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const stream = fsSync.createWriteStream(logPath, { flags: 'a' });
      const write = (text: string) => {
        try {
          stream.write(text);
        } catch {}
      };

      write(`Command: ${displayCommand}\n`);
      write(`CWD: ${cwd}\n`);
      write(`Project: ${projectId}\n`);
      write(`Started: ${new Date().toISOString()}\n`);
      write('--- STREAM BEGIN ---\n');
      child.stdout.on('data', (chunk) => write(`[STDOUT] ${chunk.toString()}`));
      child.stderr.on('data', (chunk) => write(`[STDERR] ${chunk.toString()}`));

      let exitCode: number | null = null;
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
        const error = new Error(`Command failed with code ${exitCode}`);
        (error as any).command = displayCommand;
        (error as any).logPath = logPath;
        throw error;
      }

      return { logPath, displayCommand };
    },
  });
}
