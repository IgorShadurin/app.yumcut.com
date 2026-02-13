import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from './logger';

const execFileAsync = promisify(execFile);
const MIN_FFMPEG_VERSION = '7.1.1';

export async function ensureFfmpegVersion(): Promise<void> {
  if (process.env.DAEMON_SKIP_FFMPEG_CHECK === '1') {
    log.warn('Skipping FFmpeg version check due to DAEMON_SKIP_FFMPEG_CHECK=1');
    return;
  }
  let stdout: string;
  try {
    const result = await execFileAsync('ffmpeg', ['-version']);
    stdout = result.stdout?.toString() ?? '';
  } catch (err: any) {
    log.error('FFmpeg not found or failed to execute', { error: err?.message || String(err) });
    throw new Error('FFmpeg 7.1.1+ is required. Install it before starting the daemon.');
  }

  const detected = parseVersion(stdout);
  if (!detected) {
    log.error('Unable to parse FFmpeg version output', { stdout: stdout.slice(0, 200) });
    throw new Error('Failed to detect FFmpeg version. Ensure ffmpeg -version works locally.');
  }

  if (compareSemver(detected, MIN_FFMPEG_VERSION) < 0) {
    log.error('FFmpeg version is too old', { detected, minimum: MIN_FFMPEG_VERSION });
    throw new Error(`FFmpeg ${MIN_FFMPEG_VERSION}+ is required, detected ${detected}. Upgrade ffmpeg before running the daemon.`);
  }

  log.info('FFmpeg version OK', { version: detected });
}

function parseVersion(output: string): string | null {
  const match = output.match(/ffmpeg version\s+([0-9]+(?:\.[0-9]+){1,2})/i);
  return match?.[1] ?? null;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((v) => Number(v));
  const pb = b.split('.').map((v) => Number(v));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] || 0;
    const bi = pb[i] || 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}
