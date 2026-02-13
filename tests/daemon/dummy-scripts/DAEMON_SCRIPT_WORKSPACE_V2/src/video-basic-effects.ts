#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

function readArg(prefix: string): string | null {
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) return null;
  const value = found.slice(prefix.length);
  return value || null;
}

const workspace = resolve(readArg('--workspace=') || '.');
const blocks = readArg('--blocks-json=') || '';
const imagesDir = readArg('--images-dir=') || '';
const transition = readArg('--transition-name=') || 'basic';

console.log('[dummy] video:basic-effects invoked', { workspace, blocks, imagesDir, transition });

const partsDir = join(workspace, 'video-basic-effects', 'parts');
mkdirSync(partsDir, { recursive: true });
// Create dummy part files to satisfy downstream checks
for (let i = 1; i <= 3; i += 1) {
  const partFile = join(partsDir, `${String(i).padStart(3, '0')}.mp4`);
  mkdirSync(dirname(partFile), { recursive: true });
  writeFileSync(partFile, Buffer.from(`DUMMY_PART_${i}`));
}

const outDir = join(workspace, 'video-basic-effects', 'final');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'simple.1080p.mp4');
writeFileSync(outFile, Buffer.from('DUMMY_VIDEO_PART'));

console.log('[dummy] wrote main video to', outFile);
