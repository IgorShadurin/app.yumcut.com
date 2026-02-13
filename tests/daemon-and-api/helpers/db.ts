import { mkdirSync, rmSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';

export type TempDb = {
  url: string;
  dir: string;
  file: string;
  cleanup: () => void;
};

function detectProvider(): 'sqlite' | 'mysql' | 'postgresql' | string {
  try {
    const content = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const m = content.match(/provider\s*=\s*"([^"]+)"/);
    return (m ? m[1] : '').toLowerCase();
  } catch {
    return '';
  }
}

export function createTempSqliteDb(): TempDb {
  const dir = join(process.cwd(), 'tests', 'daemon-and-api', '.tmp', randomUUID());
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'dev.db');
  // Prisma expects a file: URL relative to the prisma schema dir; use a relative path from cwd
  const rel = relative(process.cwd(), file).split('\\').join('/');
  const url = `file:${rel}`;
  // If provider is sqlite, materialize schema; otherwise skip (health tests don't require DB)
  const provider = detectProvider();
  if (provider === 'sqlite') {
    const res = spawnSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    });
    if (res.status !== 0) {
      throw new Error('Failed to push Prisma schema for temp DB');
    }
  }
  function cleanup() {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  return { url, dir, file, cleanup };
}
