#!/usr/bin/env tsx
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('Usage: tsx transcript-to-json.ts <input.txt> <output.json>');
  process.exit(2);
}

let content = '';
try { content = readFileSync(input, 'utf8'); } catch (e) {
  console.error('Cannot read input', e);
  process.exit(1);
}

const blocks = content.split(/\n+/).filter(Boolean).slice(0, 2).map((line, i) => ({
  id: `b${i + 1}`,
  text: line.slice(0, 120),
  start: i * 2,
  end: i * 2 + 2,
}));

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ blocks }, null, 2), 'utf8');
console.log('Wrote JSON to', output);

