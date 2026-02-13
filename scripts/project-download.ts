#!/usr/bin/env tsx
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { config as loadEnv } from 'dotenv';
import { writeProjectGuide } from './helpers/project-guide';

const REQUIRED_ENV_VARS = [
  'SSH_USERNAME',
  'SSH_SERVER_IP',
  'SSH_REMOTE_BASE_PATH',
  'SSH_LOCAL_BASE_PATH',
] as const;

type RequiredEnv = (typeof REQUIRED_ENV_VARS)[number];

type CliOverrides = {
  promptPassword: boolean;
  username?: string;
  server?: string;
  remoteBase?: string;
  localBase?: string;
  port?: string;
  rebuild?: boolean;
  forceDownload?: boolean;
};

function parseFlags(argv: string[]): { projectId?: string; flags: CliOverrides } {
  const out: CliOverrides = { promptPassword: false };
  const args = [...argv];
  let projectId: string | undefined;
  const takeValue = (arr: string[]) => (arr.length > 0 ? String(arr.shift()) : undefined);
  while (args.length > 0) {
    const tok = String(args.shift());
    if (tok.startsWith('--')) {
      switch (tok) {
        case '--prompt-password':
          out.promptPassword = true;
          break;
        case '--rebuild':
          out.rebuild = true;
          break;
      case '--user':
        out.username = takeValue(args);
        break;
        case '--host':
          out.server = takeValue(args);
          break;
        case '--remote-base':
          out.remoteBase = takeValue(args);
          break;
        case '--local-base':
          out.localBase = takeValue(args);
          break;
        case '--port':
          out.port = takeValue(args);
          break;
        case '--force-download':
          out.forceDownload = true;
          break;
        default:
          // tolerate unknown flags
          break;
      }
    } else if (!projectId) {
      projectId = tok;
    }
  }
  // Extra safety: detect rebuild from raw argv if npm altered arg ordering
  if (!out.rebuild && argv.includes('--rebuild')) out.rebuild = true;
  if (!out.forceDownload && argv.includes('--force-download')) out.forceDownload = true;
  return { projectId, flags: out };
}

function printUsage(message?: string): never {
  if (message) {
    console.error(message);
    console.error('');
  }
  console.error('Usage: npm run project:download -- <projectId> [--rebuild] [--prompt-password] [--user <name>] [--host <ip>] [--remote-base <path>] [--local-base <path>] [--port <22>]');
  console.error('');
  console.error('Downloads <projectId> using scp from \'${SSH_REMOTE_BASE_PATH}/<projectId>\'');
  console.error('and stores it under \'${SSH_LOCAL_BASE_PATH}/<projectId>\'.');
  process.exit(1);
}

function resolveEnv(): void {
  const envPath = path.resolve(process.cwd(), '.ssh.env');
  if (!existsSync(envPath)) {
    console.error('Missing .ssh.env file. Create one based on ssh.env.example.');
    process.exit(1);
  }

  loadEnv({ path: envPath, override: false });

  const missing: RequiredEnv[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key] || process.env[key]!.trim().length === 0) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(`Missing required environment variable(s) in .ssh.env: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function assertValidProjectId(projectId: string) {
  if (projectId.includes('..')) {
    printUsage('projectId must not contain path traversal sequences.');
  }
  if (path.isAbsolute(projectId)) {
    printUsage('projectId must be a relative segment, not an absolute path.');
  }
}

async function promptForPassword(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('SSH password is required but cannot be prompted in a non-interactive shell.');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  type MaskedInterface = readline.Interface & {
    stdoutMuted?: boolean;
    output: NodeJS.WriteStream;
    _writeToOutput?: (stringToWrite: string) => void;
  };

  const maskedRl = rl as MaskedInterface;
  const originalWrite = maskedRl._writeToOutput?.bind(maskedRl);

  maskedRl._writeToOutput = (stringToWrite: string) => {
    if (maskedRl.stdoutMuted) {
      maskedRl.output.write('*');
    } else if (typeof originalWrite === 'function') {
      originalWrite(stringToWrite);
    } else {
      maskedRl.output.write(stringToWrite);
    }
  };

  return new Promise((resolve) => {
    maskedRl.stdoutMuted = true;
    maskedRl.question('SSH password: ', (answer) => {
      maskedRl.stdoutMuted = false;
      maskedRl.output.write('\n');
      if (originalWrite) {
        maskedRl._writeToOutput = originalWrite;
      }
      maskedRl.close();
      resolve(answer.trim());
    });
  });
}

function posixJoin(base: string, segment: string): string {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return path.posix.join(normalizedBase, segment);
}

async function ensureLocalTarget(localBase: string): Promise<void> {
  await fs.mkdir(localBase, { recursive: true });
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error = new Error(`${command} exited with code ${code}`);
        (error as any).exitCode = code;
        (error as any).signal = child.signalCode ?? null;
        reject(error);
      }
    });
  });
}

function isCmdAvailable(cmd: string): boolean {
  const res = spawnSync('bash', ['-lc', `command -v ${cmd} >/dev/null 2>&1`], { stdio: 'ignore' });
  return res.status === 0;
}

function buildSshCommand(port?: string | null) {
  const cipherSpec = 'aes128-gcm@openssh.com,chacha20-poly1305@openssh.com,aes128-ctr';
  const parts = ['ssh', '-T', '-o', 'IPQoS=throughput', '-c', cipherSpec];
  if (port && String(port).trim()) parts.push('-p', String(port).trim());
  return parts.join(' ');
}

function getRsyncVersion(): { major: number; minor: number; patch: number } | null {
  try {
    const out = spawnSync('rsync', ['--version'], { encoding: 'utf8' });
    if (out.status !== 0 || !out.stdout) return null;
    const first = out.stdout.split(/\r?\n/)[0] || '';
    const m = first.match(/rsync\s+(?:version\s+)?(\d+)\.(\d+)(?:\.(\d+))?/i);
    if (!m) return null;
    return { major: Number(m[1] || 0), minor: Number(m[2] || 0), patch: Number(m[3] || 0) };
  } catch {
    return null;
  }
}

async function main() {
  resolveEnv();

  const { projectId, flags } = parseFlags(process.argv.slice(2));
  if (!projectId) {
    printUsage('Missing required <projectId>.');
  }
  assertValidProjectId(projectId);

  const username = (flags.username || process.env.SSH_USERNAME)!;
  let password = process.env.SSH_PASSWORD ?? '';
  const server = (flags.server || process.env.SSH_SERVER_IP)!;
  const remoteBase = (flags.remoteBase || process.env.SSH_REMOTE_BASE_PATH)!;
  const localBase = (flags.localBase || process.env.SSH_LOCAL_BASE_PATH)!;
  const port = flags.port || process.env.SSH_PORT;

  const shouldPrompt = flags.promptPassword || process.env.SSH_PROMPT_PASSWORD === 'true' || !password;
  if (shouldPrompt) {
    try {
      const prompted = await promptForPassword();
      if (prompted) {
        password = prompted;
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  if (!password) {
    console.error('SSH password is required. Set SSH_PASSWORD, pass --prompt-password interactively, or configure SSH_PROMPT_PASSWORD=true.');
    process.exit(1);
  }

  const remotePath = posixJoin(remoteBase, projectId);
  const localBaseDir = path.resolve(localBase);
  const finalLocalPath = path.resolve(localBaseDir, projectId);

  await ensureLocalTarget(localBaseDir);

  // If requested, or if a local directory already exists and user did not force download, just rebuild the guide.
  const localDirExists = (() => {
    try { return existsSync(finalLocalPath) && !!fs.stat(finalLocalPath).then((s)=>s.isDirectory()); } catch { return false; }
  })();
  if (flags.rebuild || (localDirExists && !flags.forceDownload)) {
    try {
      const stat = await fs.stat(finalLocalPath);
      if (!stat.isDirectory()) throw new Error('Target exists but is not a directory');
    } catch (err: any) {
      console.error('Rebuild requested, but local project directory was not found:', finalLocalPath);
      process.exit(1);
    }
    const guidePath = await writeProjectGuide({ projectId, projectRoot: finalLocalPath });
    console.log(`✔ Rebuilt guide file -> ${guidePath}`);
    if (!flags.rebuild && localDirExists && !flags.forceDownload) {
      console.log('Local directory exists; skipped download. Use --force-download to re-fetch files.');
    }
    return;
  }

  console.log(`Downloading project '${projectId}' from ${remotePath}...`);
  console.log(`Target directory: ${finalLocalPath}`);

  // Prefer rsync (faster and more resilient) if available
  const useRsync = isCmdAvailable('rsync');
  const sshCmd = buildSshCommand(port || null);
  const scpArgs = ['-r', '-c', 'aes128-gcm@openssh.com', '-o', 'IPQoS=throughput'];
  if (port) scpArgs.push('-P', port);
  scpArgs.push(`${username}@${server}:${remotePath}`);
  scpArgs.push(localBaseDir);

  try {
    if (useRsync) {
      const ver = getRsyncVersion();
      const progressFlag = ver && (ver.major > 3 || (ver.major === 3 && ver.minor >= 1)) ? '--info=progress2' : '--progress';
      const rsyncBase = ['-a', progressFlag, '-e', sshCmd];
      const rsyncArgs = [...rsyncBase, `${username}@${server}:${remotePath}/`, `${finalLocalPath}/`];
      if (password) {
        try {
          await runCommand('sshpass', ['-p', password, 'rsync', ...rsyncArgs]);
        } catch (err: any) {
          if (err.code === 'ENOENT') {
            console.warn('sshpass not installed; falling back to interactive rsync (will prompt).');
            await runCommand('rsync', rsyncArgs);
          } else if (err.exitCode === 5 || err.exitCode === 255) {
            console.warn('sshpass failed to authenticate/connect; retrying with interactive rsync.');
            await runCommand('rsync', rsyncArgs);
          } else {
            throw err;
          }
        }
      } else {
        await runCommand('rsync', rsyncArgs);
      }
    } else {
      if (password) {
        try {
          await runCommand('sshpass', ['-p', password, 'scp', ...scpArgs]);
        } catch (sshpassError) {
          const err = sshpassError as NodeJS.ErrnoException & { exitCode?: number };
          if (err.code === 'ENOENT') {
            console.warn(
              'sshpass is not installed. Either install it (e.g., "brew install hudochenkov/sshpass/sshpass" or "sudo apt-get install sshpass") or enter the password when prompted.'
            );
            await runCommand('scp', scpArgs);
          } else if (err.exitCode === 5) {
            console.warn('sshpass reported an authentication error (exit code 5). Falling back to interactive scp prompt.');
            await runCommand('scp', scpArgs);
          } else if (err.exitCode === 255) {
            console.warn('sshpass was disconnected by the remote host (exit code 255). Retrying with interactive scp prompt.');
            await runCommand('scp', scpArgs);
          } else {
            throw sshpassError;
          }
        }
      } else {
        await runCommand('scp', scpArgs);
      }
    }
    console.log(`✔ Download complete -> ${finalLocalPath}`);
    try {
      const guidePath = await writeProjectGuide({ projectId, projectRoot: finalLocalPath });
      console.log(`Guide file written to ${guidePath}`);
    } catch (guideError) {
      console.error('Failed to write project rebuild guide', guideError);
    }
  } catch (error) {
    console.error('Failed to download project');
    console.error(error);
    process.exit(1);
  }
}

void main();
