import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { DEFAULT_OVERLAY_OPACITY, DEFAULT_SPARKLES_OVERLAY_PATH, DEFAULT_WATERMARK_OPACITY, DEFAULT_WATERMARK_VIDEO_PATH } from '../constants/video-layer-defaults';
import { DEFAULT_LANGUAGE } from '@/shared/constants/languages';

let envLoaded = false;
function ensureDaemonEnvLoaded(rootDir: string) {
  if (envLoaded) return;
  const envPath = path.resolve(rootDir, '.daemon.env');
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
  envLoaded = true;
}

type GuideOptions = { projectId: string; projectRoot: string };

function quoted(p: string) {
  return JSON.stringify(p);
}

function stripQuotes(value: string | null | undefined): string | null {
  if (!value) return null;
  let s = value.trim();
  // Remove surrounding quotes if both present
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
  } else {
    // Be tolerant of a stray leading or trailing quote from logged tokens
    if (s.startsWith('"')) s = s.slice(1);
    if (s.endsWith('"')) s = s.slice(0, -1);
  }
  return s;
}

function extractEqualsArg(command: string, flag: string): string | null {
  const pattern = new RegExp(`${flag}=(\"[^\"]+\"|[^\\s]+)`);
  const match = command.match(pattern);
  return match ? match[1] : null;
}

function extractSeparatedArg(command: string, flag: string): string | null {
  const pattern = new RegExp(`${flag}\\s+("[^"]+"|[^\\s]+)`);
  const match = command.match(pattern);
  return match ? match[1] : null;
}

function extractAllSeparatedArgs(command: string, flag: string): string[] {
  const pattern = new RegExp(`${flag}\\s+("[^"]+"|[^\\s]+)`, 'g');
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(command)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

function splitOverlayValue(value: string): { path: string; opacity: string | null } {
  const stripped = stripQuotes(value) ?? '';
  const atIdx = stripped.lastIndexOf('@');
  if (atIdx > 0 && atIdx < stripped.length - 1) {
    const candidate = stripped.slice(atIdx + 1);
    if (/^\d+(\.\d+)?$/.test(candidate)) {
      return { path: stripped.slice(0, atIdx), opacity: candidate };
    }
  }
  return { path: stripped, opacity: null };
}

async function readLatestLogCommand(logDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(logDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.log')).map((entry) => path.join(logDir, entry.name));
    if (files.length === 0) return null;
    const stats = await Promise.all(files.map(async (file) => ({ file, stat: await fs.stat(file) })));
    stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    const latest = stats[0].file;
    const content = await fs.readFile(latest, 'utf8');
    const match = content.match(/^Command:\s*(.+)$/m);
    if (!match) return null;
    return match[1].trim();
  } catch {
    return null;
  }
}

async function tryReadLatestImagesCommand(projectRoot: string, sharedWorkspaceDir: string, primaryLanguageWorkspace: string): Promise<string | null> {
  const command = await readLatestLogCommand(path.join(projectRoot, 'logs', 'images'));
  if (!command) return null;
  // Example captured:
  // npm run -s image:blocks-to-qwen -- --workspace=/abs/ws --blocks-json=/abs/ws/metadata/transcript-blocks.json --new-character [--style-prompt=...]
  const remoteWorkspace = extractEqualsArg(command, '--workspace');
  const blocksArg = extractEqualsArg(command, '--blocks-json');
  const styleArg = extractEqualsArg(command, '--style-prompt');
  const hasNewCharacter = /\s--new-character(\s|$)/.test(command);
  const characterImageArg = extractEqualsArg(command, '--character-image');

  const localBlocks = toLocalWorkspacePath(
    blocksArg,
    remoteWorkspace,
    sharedWorkspaceDir,
    path.join(primaryLanguageWorkspace, 'metadata', 'transcript-blocks.json'),
  );
  const parts = [
    'npm run -s image:blocks-to-qwen --',
    `--workspace=${quoted(sharedWorkspaceDir)}`,
    `--blocks-json=${quoted(localBlocks)}`,
  ];
  if (hasNewCharacter) {
    parts.push('--new-character');
  } else if (characterImageArg) {
    const localCharacter = toLocalWorkspacePath(
      characterImageArg,
      remoteWorkspace,
      sharedWorkspaceDir,
      path.join(primaryLanguageWorkspace, 'character.png'),
    );
    parts.push(`--character-image ${quoted(localCharacter)}`);
  }
  if (styleArg) {
    const localStyle = toLocalWorkspacePath(
      styleArg,
      remoteWorkspace,
      sharedWorkspaceDir,
      path.join(primaryLanguageWorkspace, 'prompts', 'image-style.txt'),
    );
    parts.push(`--style-prompt ${quoted(localStyle)}`);
  }
  return parts.join(' ');
}

function toLocalWorkspacePath(
  value: string | null,
  remoteWorkspace: string | null,
  localWorkspace: string,
  fallback: string
): string {
  const remote = stripQuotes(value);
  if (!remote) return fallback;
  const remoteBase = stripQuotes(remoteWorkspace);
  if (remoteBase) {
    const rel = path.relative(remoteBase, remote);
    if (!rel.startsWith('..')) {
      return path.resolve(localWorkspace, rel);
    }
  }
  return remote;
}

function toLocalRepoAsset(value: string | null, repoRoot: string, fallback: string): string {
  const remote = stripQuotes(value);
  if (!remote) return fallback;
  const normalized = remote.replace(/\\/g, '/');
  const idx = normalized.indexOf('/content/');
  if (idx !== -1) {
    const rel = normalized.slice(idx + 1);
    return path.join(repoRoot, rel);
  }
  return remote;
}

function toLocalProjectPath(
  value: string | null,
  remoteProjectRoot: string | null,
  localProjectRoot: string,
  fallback: string
): string {
  const remote = stripQuotes(value);
  if (!remote) return fallback;
  const remoteBase = stripQuotes(remoteProjectRoot);
  if (remoteBase) {
    const rel = path.relative(remoteBase, remote);
    if (!rel.startsWith('..')) {
      return path.resolve(localProjectRoot, rel);
    }
  }
  return remote;
}

async function tryReadLatestVideoPartsCommand(projectRoot: string, workspaceDir: string): Promise<string | null> {
  const command = await readLatestLogCommand(path.join(projectRoot, 'logs', 'video-parts'));
  if (!command) return null;
  const remoteWorkspace = extractEqualsArg(command, '--workspace');
  const blocksArg = extractEqualsArg(command, '--blocks-json');
  const imagesArg = extractEqualsArg(command, '--images-dir');
  const effectArg = extractEqualsArg(command, '--transition-name') ?? 'basic';

  const localBlocks = toLocalWorkspacePath(blocksArg, remoteWorkspace, workspaceDir, path.join(workspaceDir, 'metadata', 'transcript-blocks.json'));
  const localImages = toLocalWorkspacePath(imagesArg, remoteWorkspace, workspaceDir, path.join(workspaceDir, 'images'));

  const parts = [
    'npm run -s video:basic-effects --',
    `--workspace=${quoted(workspaceDir)}`,
    `--blocks-json=${quoted(localBlocks)}`,
    `--images-dir=${quoted(localImages)}`,
    `--transition-name=${stripQuotes(effectArg) ?? 'basic'}`,
  ];
  return parts.join(' ');
}

async function tryReadLatestVideoMergeCommand(projectRoot: string, workspaceDir: string): Promise<string | null> {
  const command = await readLatestLogCommand(path.join(projectRoot, 'logs', 'video'));
  if (!command) return null;
  const repoRoot = process.cwd();
  const finalArg = extractSeparatedArg(command, '--final');
  const mainVideoArg = extractSeparatedArg(command, '--main-video');
  const audioArg = extractSeparatedArg(command, '--audio');
  const overlayArgs = extractAllSeparatedArgs(command, '--overlay');
  const backgroundArg = extractSeparatedArg(command, '--background-music');

  const mainVideoPath = stripQuotes(mainVideoArg);
  const remoteWorkspace = mainVideoPath ? path.dirname(path.dirname(path.dirname(mainVideoPath))) : null;
  const remoteProjectRoot = remoteWorkspace ? path.dirname(remoteWorkspace) : null;

  const localFinal = toLocalWorkspacePath(
    finalArg,
    remoteWorkspace,
    workspaceDir,
    path.join(workspaceDir, 'video-merge-layers', 'final.1080p.watermarked.mp4')
  );
  const localMain = toLocalWorkspacePath(
    mainVideoArg,
    remoteWorkspace,
    workspaceDir,
    path.join(workspaceDir, 'video-basic-effects', 'final', 'simple.1080p.mp4')
  );
  const localAudio = toLocalProjectPath(
    audioArg,
    remoteProjectRoot,
    projectRoot,
    path.join(projectRoot, 'workspace', DEFAULT_LANGUAGE, 'audio', 'manual-run', 'take-1.wav')
  );
  const localBackground = toLocalRepoAsset(backgroundArg, repoRoot, path.join(repoRoot, 'content', 'music', 'my-2-back.wav'));

  const overlayParts: string[] = [];
  for (const rawOverlay of overlayArgs) {
    const { path: overlayPathRaw, opacity } = splitOverlayValue(rawOverlay);
    if (!overlayPathRaw) continue;
    const normalized = overlayPathRaw.replace(/\\/g, '/');
    const localPath = normalized.includes('/content/')
      ? toLocalRepoAsset(overlayPathRaw, repoRoot, overlayPathRaw)
      : toLocalWorkspacePath(overlayPathRaw, remoteWorkspace, workspaceDir, overlayPathRaw);
    const value = opacity ? `${localPath}@${opacity}` : localPath;
    overlayParts.push(`--overlay ${quoted(value)}`);
  }

  const parts: string[] = [
    'npm run -s video:merge-layers -- 1080p',
    `--final ${quoted(localFinal)}`,
    `--main-video ${quoted(localMain)}`,
    `--audio ${quoted(localAudio)}`,
  ];
  if (stripQuotes(backgroundArg)) {
    parts.push(`--background-music ${quoted(localBackground)}`);
  }
  parts.push(...overlayParts);
  return parts.join(' ');
}

function buildCommands(projectId: string, projectRoot: string): string[] {
  const resolvedRoot = path.resolve(projectRoot);
  const workspaceDir = path.join(resolvedRoot, 'workspace');
  const transcriptTxt = path.join(workspaceDir, 'transcript.txt');
  const metadataJson = path.join(workspaceDir, 'metadata', 'transcript-blocks.json');
  const captionsOverlay = path.join(workspaceDir, 'captions-video', 'out-alpha-validated.webm');
  const cmds: string[] = [];
  cmds.push('<TRANSCRIBE_COMMAND>');
  cmds.push(`npm run transcript:json -- ${quoted(transcriptTxt)} ${quoted(metadataJson)}`);
  cmds.push(`npm run render:python -- --input ${quoted(metadataJson)} --output ${quoted(captionsOverlay)}`);
  // v2: Qwen Image Edit pipeline
  cmds.push(
    [
      'npm run -s image:blocks-to-qwen --',
      `--workspace=${quoted(workspaceDir)}`,
      `--character-image ${quoted(path.join(resolvedRoot, 'character.png'))}`,
      `--blocks-json ${quoted(metadataJson)}`,
    ].join(' ')
  );
  cmds.push('<VIDEO_PARTS_COMMAND>');
  cmds.push('<VIDEO_MERGE_COMMAND>');
  return cmds;
}

async function detectWorkspaceLanguages(workspaceRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    const languages = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^[a-z0-9-]+$/i.test(name) && !name.startsWith('.'));
    return languages.length > 0 ? languages.sort() : [];
  } catch {
    return [];
  }
}

export async function writeProjectGuide(options: GuideOptions): Promise<string> {
  const { projectId, projectRoot } = options;
  const resolvedRoot = path.resolve(projectRoot);
  await fs.mkdir(resolvedRoot, { recursive: true });
  ensureDaemonEnvLoaded(process.cwd());

  // Do not include headers; file should contain commands only

  const steps = buildCommands(projectId, resolvedRoot);
  const workspaceDir = path.join(resolvedRoot, 'workspace');
  const repoRoot = process.cwd();
  const languages = await detectWorkspaceLanguages(workspaceDir);
  const primaryLanguage = languages[0] ?? DEFAULT_LANGUAGE;
  const primaryLanguageWorkspace = path.join(workspaceDir, primaryLanguage);

  // Fill transcription command
  const transcribeIdx = steps.findIndex((l) => l === '<TRANSCRIBE_COMMAND>');
  if (transcribeIdx !== -1) {
    const bestWav = await findBestWavFile(resolvedRoot);
    const fallbackAudio = path.join(primaryLanguageWorkspace, 'audio', 'manual-run', 'take-1.wav');
    const audioPath = bestWav || fallbackAudio;
    const transcribeCmd = `npm run agent -- --audio ${quoted(audioPath)} --step 1 --workspace ${quoted(primaryLanguageWorkspace)}`;
    steps[transcribeIdx] = transcribeCmd;
  }

  const imagesIdx = steps.findIndex((l) => /image:blocks-to-qwen/.test(l) || l.includes('src/comics-draw/generate-images-multiple.ts'));
  if (imagesIdx !== -1) {
    const cmd = await tryReadLatestImagesCommand(resolvedRoot, workspaceDir, primaryLanguageWorkspace);
    if (cmd) {
      steps[imagesIdx] = cmd;
    }
  }

  const videoPartsIdx = steps.findIndex((l) => l === '<VIDEO_PARTS_COMMAND>');
  if (videoPartsIdx !== -1) {
    const partsCmd = await tryReadLatestVideoPartsCommand(resolvedRoot, primaryLanguageWorkspace);
    if (partsCmd) {
      steps[videoPartsIdx] = partsCmd;
    } else {
      const fallbackParts = [
        'npm run -s video:basic-effects --',
        `--workspace=${quoted(primaryLanguageWorkspace)}`,
        `--blocks-json=${quoted(path.join(primaryLanguageWorkspace, 'metadata', 'transcript-blocks.json'))}`,
        // v2 default images directory
        `--images-dir=${quoted(path.join(workspaceDir, 'qwen-image-edit', 'prepared'))}`,
        '--transition-name=basic',
      ].join(' ');
      steps[videoPartsIdx] = fallbackParts;
    }
  }

  const videoMergeIdx = steps.findIndex((l) => l === '<VIDEO_MERGE_COMMAND>');
  if (videoMergeIdx !== -1) {
    const mergeCmd = await tryReadLatestVideoMergeCommand(resolvedRoot, primaryLanguageWorkspace);
    if (mergeCmd) {
      steps[videoMergeIdx] = mergeCmd;
    } else {
      const fallbackMerge = [
        'npm run -s video:merge-layers -- 1080p',
        `--final ${quoted(path.join(primaryLanguageWorkspace, 'video-merge-layers', 'final.1080p.watermarked.mp4'))}`,
        `--main-video ${quoted(path.join(primaryLanguageWorkspace, 'video-basic-effects', 'final', 'simple.1080p.mp4'))}`,
        '--audio "<PATH_TO_FINAL_WAV>"',
        `--overlay ${quoted(`${DEFAULT_SPARKLES_OVERLAY_PATH}@${DEFAULT_OVERLAY_OPACITY}`)}`,
        `--overlay ${quoted(`${DEFAULT_WATERMARK_VIDEO_PATH}@${DEFAULT_WATERMARK_OPACITY}`)}`,
        `--overlay ${quoted(path.join(primaryLanguageWorkspace, 'captions-video', 'out-alpha-validated.webm'))}#once`,
      ].join(' ');
      steps[videoMergeIdx] = fallbackMerge;
    }
  }

  // Human-friendly numbered steps with explanation + command per item
  const titles = [
    'Transcribe audio',
    'Generate metadata JSON',
    'Render captions overlay',
    'Generate images',
    'Render video parts',
    'Compile final video',
  ];
  const pairs = steps
    .filter((x) => x && x.trim().length > 0)
    .map((cmd, i) => ({ n: i + 1, title: titles[i] || `Step ${i + 1}`, cmd }));
  const content = pairs
    .map((p) => `${p.n}. ${p.title}\n${p.cmd}`)
    .join('\n\n');
  const guidePath = path.join(resolvedRoot, 'REBUILD_STEPS.txt');
  await fs.writeFile(guidePath, content, 'utf8');

  // Best-effort: update workspace/.steps/0-audio-extract.json inputFile to point at the local WAV.
  // Prefer the same take number as in the original path (e.g., take-3.wav), otherwise fall back to the newest WAV.
  try {
    const stepsJsonPath = path.join(resolvedRoot, 'workspace', '.steps', '0-audio-extract.json');
    const exists = existsSync(stepsJsonPath);
    if (exists) {
      const raw = await fs.readFile(stepsJsonPath, 'utf8');
      const backupPath = stepsJsonPath + `.bak-${Date.now()}`;
      await fs.writeFile(backupPath, raw, 'utf8');
      try {
        const json = JSON.parse(raw) as any;
        if (json && typeof json === 'object' && typeof json.inputFile === 'string') {
          const orig: string = json.inputFile;
          const m = /take[-_]?(\d+)\.wav$/i.exec(orig);
          let nextWav: string | null = null;
          if (m) {
            const takeNum = Number(m[1]);
            if (Number.isFinite(takeNum)) {
              nextWav = await findWavByTake(resolvedRoot, takeNum);
            }
          }
          if (!nextWav) {
            nextWav = await findBestWavFile(resolvedRoot);
          }
          if (nextWav) {
            (json as any).inputFile = nextWav;
            await fs.writeFile(stepsJsonPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
          }
        }
      } catch {
        // If JSON parse fails, restore backup silently
        try { await fs.writeFile(stepsJsonPath, raw, 'utf8'); } catch {}
      }
    }
  } catch {}
  return guidePath;
}

async function collectAudioRoots(projectRoot: string): Promise<string[]> {
  const roots: string[] = [];
  const workspaceRoot = path.join(projectRoot, 'workspace');
  try {
    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      roots.push(path.join(workspaceRoot, entry.name, 'audio'));
    }
  } catch {}
  roots.push(path.join(workspaceRoot, 'audio'));
  roots.push(path.join(projectRoot, 'audio'));
  return roots;
}

async function findBestWavFile(projectRoot: string): Promise<string | null> {
  const audioRoots = await collectAudioRoots(projectRoot);
  const candidates: string[] = [];
  async function walk(dir: string, depth = 0) {
    if (depth > 5) return; // guard
    let entries: any[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(p, depth + 1);
      } else if (e.isFile() && /\.wav$/i.test(e.name)) {
        candidates.push(p);
      }
    }
  }
  for (const root of audioRoots) {
    await walk(root);
  }
  if (candidates.length === 0) return null;
  const takeCandidates = candidates.filter((p) => /take-\d+\.wav$/i.test(p));
  const list = takeCandidates.length > 0 ? takeCandidates : candidates;
  const withStats = await Promise.all(
    list.map(async (p) => {
      try { const s = await fs.stat(p); return { p, t: s.mtimeMs }; } catch { return { p, t: 0 }; }
    })
  );
  withStats.sort((a, b) => b.t - a.t);
  return withStats[0]?.p || null;
}

async function findWavByTake(projectRoot: string, takeNumber: number): Promise<string | null> {
  const audioRoots = await collectAudioRoots(projectRoot);
  const pattern = new RegExp('take[-_]?' + takeNumber + '\\.wav$', 'i');
  const matches: string[] = [];
  async function walk(dir: string, depth = 0) {
    if (depth > 5) return;
    let entries: any[] = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else if (e.isFile() && pattern.test(e.name)) matches.push(p);
    }
  }
  for (const root of audioRoots) {
    await walk(root);
  }
  if (matches.length === 0) return null;
  const withStats = await Promise.all(matches.map(async (p) => { try { const s = await fs.stat(p); return { p, t: s.mtimeMs }; } catch { return { p, t: 0 }; }}));
  withStats.sort((a, b) => b.t - a.t);
  return withStats[0]?.p || null;
}
