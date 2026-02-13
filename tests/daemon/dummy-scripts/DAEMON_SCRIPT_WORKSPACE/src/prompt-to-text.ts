#!/usr/bin/env tsx
import { readFileSync } from 'fs';

function getArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function repeatToLength(base: string, targetLen: number): string {
  if (base.length >= targetLen) return base.slice(0, targetLen);
  const chunks: string[] = [];
  while (chunks.join('').length < targetLen) chunks.push(base);
  return chunks.join('').slice(0, targetLen);
}

const prompt = getArg('--prompt');
const scriptFile = getArg('--script-file');
const refine = getArg('--refine');
const duration = getArg('--duration');
const language = getArg('--language');
const mustHave = getArg('--must-have');
const avoid = getArg('--avoid');

if (scriptFile && refine && language) {
  console.error('The --language option is only permitted when generating a new script');
  process.exit(3);
}

let sourceText = '';
if (scriptFile && refine) {
  sourceText = readFileSync(scriptFile, 'utf8').trim();
} else if (prompt) {
  sourceText = prompt.trim();
}

const runId = process.env.YUMCUT_DUMMY_RUN_ID;
const forcedText = process.env.YUMCUT_DUMMY_TEXT;
const shouldFail = process.env.YUMCUT_DUMMY_FAIL_PROMPT_TO_TEXT === '1';

if (shouldFail) {
  console.error('Forced failure via YUMCUT_DUMMY_FAIL_PROMPT_TO_TEXT');
  process.exit(2);
}

const header = [
  '--- Dummy Prompt-To-Text ---',
  `mode: ${scriptFile && refine ? 'refine' : 'generate'}`,
  duration ? `duration: ${duration}` : null,
  language ? `language: ${language}` : null,
  mustHave ? `mustHave: ${mustHave}` : null,
  avoid ? `avoid: ${avoid}` : null,
  runId ? `runId: ${runId}` : null,
].filter(Boolean).join('\n');

const baseOutput = forcedText != null
  ? forcedText
  : scriptFile && refine
    ? `REFINED(${refine.slice(0, 60)}) :: ${sourceText}`
    : `DUMMY TEXT FOR PROMPT: ${sourceText}`;

// Ensure ~1000 chars to satisfy tests
const output = repeatToLength(baseOutput + '\n', 1000);

// Emit recognizable marker the daemon will trim to script content
console.log(header);
console.log('--- Script Output ---');
console.log(output);
