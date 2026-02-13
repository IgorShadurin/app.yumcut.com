#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

function get(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

const input = get('--input');
const output = get('--output');
if (!input || !output) {
  console.error('Usage: --input <json> --output <webm>');
  process.exit(2);
}

if (process.env.YUMCUT_DUMMY_FAIL_CAPTIONS === '1') {
  console.error('Forced failure via YUMCUT_DUMMY_FAIL_CAPTIONS');
  process.exit(5);
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.from('WEBMDUMMY-' + (process.env.YUMCUT_DUMMY_RUN_ID || '')));
console.log('Saved', output);
