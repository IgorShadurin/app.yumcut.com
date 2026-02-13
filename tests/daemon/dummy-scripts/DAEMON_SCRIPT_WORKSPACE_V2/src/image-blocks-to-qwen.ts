#!/usr/bin/env tsx
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

function readArg(prefix: string): string | null {
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return null;
  const value = match.slice(prefix.length);
  return value.length > 0 ? value : null;
}

const workspace = resolve(readArg('--workspace=') || '.');
const metadataPath = readArg('--blocks-json=');
const stylePrompt = readArg('--style-prompt=');
const characterImage = readArg('--character-image=');
const isNewCharacter = process.argv.includes('--new-character');

console.log('[dummy-image-generator] workspace:', workspace);
console.log('[dummy-image-generator] metadata:', metadataPath);
console.log('[dummy-image-generator] stylePrompt:', stylePrompt);
console.log('[dummy-image-generator] characterImage:', characterImage);
console.log('[dummy-image-generator] newCharacter:', isNewCharacter);

// Basic directory structure expected by downstream steps.
const qwenDir = join(workspace, 'qwen-image-edit');
const preparedDir = join(workspace, 'prepared');
const imagesDir = join(workspace, 'images');

[qwenDir, preparedDir, imagesDir].forEach((dir) => mkdirSync(dir, { recursive: true }));

// Produce placeholder JPG files in prepared/images directories.
for (let i = 1; i <= 3; i += 1) {
  const fileName = `${String(i).padStart(3, '0')}.jpg`;
  writeFileSync(join(preparedDir, fileName), `PREPARED_IMAGE_${i}`);
  writeFileSync(join(imagesDir, fileName), `GENERATED_IMAGE_${i}`);
}

// When editing an existing character, copy the reference image so tests can assert usage.
if (!isNewCharacter && characterImage && existsSync(characterImage)) {
  const dest = join(workspace, 'selected-character.jpg');
  try {
    copyFileSync(characterImage, dest);
  } catch {
    writeFileSync(dest, 'STATIC_CHARACTER_PLACEHOLDER');
  }
}

// Write a unique character image for dynamic runs so the daemon can upload it.
if (isNewCharacter) {
  const uniquePath = join(qwenDir, 'unique-character.jpg');
  writeFileSync(uniquePath, 'DYNAMIC_CHARACTER_IMAGE');
}

process.exit(0);
