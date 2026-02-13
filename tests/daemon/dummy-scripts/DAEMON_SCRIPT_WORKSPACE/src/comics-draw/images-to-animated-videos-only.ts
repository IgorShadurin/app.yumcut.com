#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// Args: RESOLUTION, --full, --workspace=..., --blocks-json=..., --background-music ..., --overlay ...
const args = process.argv.slice(2);
const workspaceArg = args.find((a) => a.startsWith('--workspace='));
const workspace = workspaceArg ? workspaceArg.split('=')[1] : process.cwd();

if (process.env.YUMCUT_DUMMY_FAIL_VIDEO === '1') {
  console.error('Forced failure via YUMCUT_DUMMY_FAIL_VIDEO');
  process.exit(6);
}
const outDir = join(workspace, 'comics-vertical', 'video', 'step2');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'comics-vertical-animation.1080p-with-audio.mp4');
writeFileSync(outPath, Buffer.from('MP4DUMMY-' + (process.env.YUMCUT_DUMMY_RUN_ID || '')));
console.log('Saved', outPath);
