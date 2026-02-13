#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function readArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1] ?? null;
  }
  const prefixed = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (prefixed) return prefixed.slice(flag.length + 1) || null;
  return null;
}

const finalTarget = readArg('--final') ?? readArg('--out');
if (!finalTarget) {
  console.error('[dummy] --final <path> required');
  process.exit(1);
}

const finalPath = resolve(finalTarget);
mkdirSync(dirname(finalPath), { recursive: true });
writeFileSync(finalPath, Buffer.from('DUMMY_FINAL_VIDEO'));

console.log('[dummy] video:merge-layers produced final output at', finalPath);
