#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

function readArg(prefix: string): string | null {
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) return null;
  const value = found.slice(prefix.length);
  return value || null;
}

const workspace = resolve(readArg('--workspace=') || '.');
const blocksJson = readArg('--blocks-json=');
const characterImage = readArg('--character-image=');
const promptStyle = readArg('--prompt-style=');
const captionsPreset = readArg('--preset=');

console.log('generate-images-multiple.ts called with', {
  workspace,
  blocksJson,
  characterImage,
  promptStyle,
  captionsPreset,
});

const preparedDir = join(workspace, 'comics-vertical', 'prepared');
const imagesDir = join(workspace, 'comics-vertical', 'images');
mkdirSync(preparedDir, { recursive: true });
mkdirSync(imagesDir, { recursive: true });

// Produce a few mock images so downstream steps can locate them.
for (let i = 1; i <= 3; i += 1) {
  const name = `${String(i).padStart(3, '0')}.jpg`;
  writeFileSync(join(preparedDir, name), Buffer.from(`DUMMY_PREPARED_${i}`));
  writeFileSync(join(imagesDir, name), Buffer.from(`DUMMY_IMAGE_${i}`));
}

process.exit(0);
