#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

const audio = arg('--audio');
const step = arg('--step');
const workspace = arg('--workspace') || process.cwd();
const lang = arg('--transcribe-language') || 'en';

if (step !== '1') {
  console.log('noop step');
  process.exit(0);
}

const transcriptPath = join(workspace, 'transcript.txt');
if (process.env.YUMCUT_DUMMY_FAIL_AGENT === '1') {
  console.error('Forced failure via YUMCUT_DUMMY_FAIL_AGENT');
  process.exit(4);
}
const transcriptBody = process.env.YUMCUT_DUMMY_TRANSCRIPT
  ? process.env.YUMCUT_DUMMY_TRANSCRIPT
  : 'lorem ipsum dolor sit amet'.repeat(10);
const transcript = `DUMMY TRANSCRIPT (lang=${lang})\nAUDIO=${audio || 'none'}\nRUN=${process.env.YUMCUT_DUMMY_RUN_ID || ''}\n` + transcriptBody;
mkdirSync(workspace, { recursive: true });
writeFileSync(transcriptPath, transcript, 'utf8');
console.log('Transcript created at', transcriptPath);
