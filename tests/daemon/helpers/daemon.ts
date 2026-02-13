import { spawn, ChildProcess } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

export type DaemonProcess = {
  proc: ChildProcess;
  stdout: string;
  stderr: string;
  stop: () => Promise<void>;
};

export function makeEnvFile(dir: string, content: string): string {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'daemon.env');
  writeFileSync(p, content, 'utf8');
  return p;
}

export function startDaemon(envFilePath: string, extraEnv?: Record<string, string>): DaemonProcess {
  const tsxBin = resolve(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  const entry = resolve(process.cwd(), 'scripts/daemon/index.ts');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DAEMON_ENV_FILE: envFilePath,
    DEBUG: '0',
    DAEMON_LOGS_SILENT: '0',
    DAEMON_USE_FAKE_CLI: '1',
    DAEMON_SKIP_FFMPEG_CHECK: process.env.DAEMON_SKIP_FFMPEG_CHECK || '1',
    YUMCUT_PROMPT_STUB_DELAY_MS: process.env.YUMCUT_PROMPT_STUB_DELAY_MS || '1200',
    ...(extraEnv || {}),
  };
  const proc = spawn(process.execPath, [tsxBin, entry], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (c) => { stdout += c.toString(); });
  proc.stderr.on('data', (c) => { stderr += c.toString(); });
  return {
    proc,
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    async stop() {
      if (proc.killed) return;
      proc.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 2000);
        proc.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    },
  };
}
