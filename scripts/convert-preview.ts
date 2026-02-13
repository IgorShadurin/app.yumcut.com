#!/usr/bin/env tsx
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

type CliOptions = {
  source?: string;
  targetImage?: string;
  targetVideo?: string;
  height: number;
  duration: number;
  fps: number;
  preset: string;
  crf: number;
};

const DEFAULTS: CliOptions = {
  height: 400,
  duration: 3,
  fps: 30,
  preset: 'slow',
  crf: 12,
};

function printUsage(message?: string) {
  if (message) {
    console.error(`Error: ${message}`);
  }
  console.log(`\nUsage: npm run tools:convert-preview -- \
  --source <input-image> \
  --target-image <resized-image-path> \
  --target-video <preview-video-path> \
  [--height 400] [--duration 3] [--fps 30] [--preset slow] [--crf 12]\n\nExample:\n  npm run tools:convert-preview -- \\
    --source "./assets/source.jpg" \\
    --target-image public/template/example/preview.jpg \\
    --target-video public/template/example/preview.mp4\n`);
  process.exit(message ? 1 : 0);
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
  }

  const options: Partial<CliOptions> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      printUsage(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      printUsage(`Missing value for --${key}`);
    }
    i += 1;
    switch (key) {
      case 'source':
        options.source = next;
        break;
      case 'target-image':
        options.targetImage = next;
        break;
      case 'target-video':
        options.targetVideo = next;
        break;
      case 'height':
        options.height = Number(next);
        break;
      case 'duration':
        options.duration = Number(next);
        break;
      case 'fps':
        options.fps = Number(next);
        break;
      case 'preset':
        options.preset = next;
        break;
      case 'crf':
        options.crf = Number(next);
        break;
      default:
        printUsage(`Unknown option: --${key}`);
    }
  }

  const merged: CliOptions = { ...DEFAULTS, ...options } as CliOptions;

  if (!merged.source) {
    printUsage('Missing required --source option');
  }
  if (!merged.targetImage) {
    printUsage('Missing required --target-image option');
  }
  if (!merged.targetVideo) {
    printUsage('Missing required --target-video option');
  }

  if (!Number.isFinite(merged.height) || merged.height <= 0) {
    printUsage('--height must be a positive number');
  }
  if (!Number.isFinite(merged.duration) || merged.duration <= 0) {
    printUsage('--duration must be a positive number');
  }
  if (!Number.isFinite(merged.fps) || merged.fps <= 0) {
    printUsage('--fps must be a positive number');
  }
  if (!Number.isFinite(merged.crf) || merged.crf < 0) {
    printUsage('--crf must be zero or greater');
  }

  return merged;
}

async function ensureParentDir(filePath: string) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function main() {
  const options = parseArgs();
  const sourcePath = path.resolve(options.source!);
  const targetImage = path.resolve(options.targetImage!);
  const targetVideo = path.resolve(options.targetVideo!);

  try {
    await fs.access(sourcePath);
  } catch {
    printUsage(`Source image not found at ${sourcePath}`);
  }

  await Promise.all([ensureParentDir(targetImage), ensureParentDir(targetVideo)]);

  const resizeArgs = [
    sourcePath,
    '-resize',
    `x${options.height}`,
    targetImage,
  ];

  const videoArgs = [
    '-y',
    '-loop', '1',
    '-i', sourcePath,
    '-vf', 'scale=1080:1920:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264',
    '-preset', options.preset,
    '-crf', String(options.crf),
    '-t', String(options.duration),
    '-r', String(options.fps),
    '-movflags', '+faststart',
    targetVideo,
  ];

  console.log('> Running ImageMagick to create preview image');
  await runCommand('magick', resizeArgs);

  console.log('> Running ffmpeg to create preview video');
  await runCommand('ffmpeg', videoArgs);

  console.log('Conversion complete:', { targetImage, targetVideo });
}

main().catch((err) => {
  console.error('Conversion failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
