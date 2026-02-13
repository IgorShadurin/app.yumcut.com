#!/usr/bin/env tsx
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { dirname } from 'path';

function getAll(flag: string): string[] {
  const res: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === flag && process.argv[i + 1]) res.push(process.argv[i + 1]);
  }
  return res;
}

function getOne(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

const textFile = getOne('--text-file');
const outputs = getAll('--output');
const voice = getOne('--voice');
const style = getOne('--style');

const text = textFile ? readFileSync(textFile, 'utf8') : 'NO_TEXT';
const runId = process.env.YUMCUT_DUMMY_RUN_ID || '';
const fail = process.env.YUMCUT_DUMMY_FAIL_PROMPT_TO_WAV === '1';
if (fail) {
  console.error('Forced failure via YUMCUT_DUMMY_FAIL_PROMPT_TO_WAV');
  process.exit(3);
}

// Write a tiny WAV header followed by some bytes so ffmpeg tools could parse if needed
function fakeWavBytes(payload: string): Buffer {
  const header = Buffer.from('RIFF$WAVEfmt ', 'ascii');
  const body = Buffer.from((voice || 'voice') + '|' + (style || '') + '|' + runId + '|' + payload.slice(0, 128), 'utf8');
  return Buffer.concat([header, body]);
}

for (const out of outputs) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, fakeWavBytes(text));
  // Write sidecar txt to ease debugging during local dev (not used by daemon)
  try { writeFileSync(out + '.txt', `Generated for: ${voice || 'voice'}\nStyle: ${style || ''}\n` + text); } catch {}
}

console.log(`Wrote ${outputs.length} wav(s)`);
