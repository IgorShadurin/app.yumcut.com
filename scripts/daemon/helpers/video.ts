import path from 'path';
import { promises as fs } from 'fs';
import { log } from './logger';
import { runNpmCommand } from './video/run-npm-command';
import { resolveImagesDirectory } from './video/resolve-images-directory';
import { assertFileExists } from './video/assert-file-exists';
import { resolveCustomAssetPath } from './video/resolve-custom-asset-path';
import { injectCtaIntoParts } from './video/inject-cta';
import { isDummyScriptWorkspace, writeDummyMainVideo } from './dummy-fallbacks';
import type { ScriptMode } from './config';
import { writePartsTimeline } from './video/parts-timeline';
import {
  DEFAULT_BACKGROUND_MUSIC_PATH,
  DEFAULT_OVERLAY_OPACITY,
  DEFAULT_SPARKLES_OVERLAY_PATH,
  DEFAULT_WATERMARK_OPACITY,
  DEFAULT_WATERMARK_VIDEO_PATH,
} from '../../constants/video-layer-defaults';

const DEFAULT_RESOLUTION = '1080p';
const DEFAULT_SCRIPT_MODE: ScriptMode = 'fast';
const IMAGE_FILE_PATTERN = /^\d{3}\.(?:jpe?g|png)$/i;

export async function renderVideoParts(params: {
  projectId: string;
  workspaceRoot: string;
  commandsWorkspaceRoot?: string | null;
  logDir: string;
  scriptWorkspaceV2: string;
  metadataJsonPath: string;
  effectName: string;
  imagesDir?: string | null;
  clean?: boolean;
  includeCallToAction?: boolean;
  targetLanguage?: string | null;
  voiceExternalId?: string | null;
  scriptMode?: ScriptMode | null;
  isTemplateV2?: boolean;
}) {
  const {
    projectId,
    workspaceRoot,
    commandsWorkspaceRoot,
    logDir,
    scriptWorkspaceV2,
    metadataJsonPath,
    effectName,
    imagesDir,
    clean = true,
    includeCallToAction = true,
    targetLanguage = 'en',
    voiceExternalId = null,
    scriptMode,
    isTemplateV2 = false,
  } = params;
  const mode: ScriptMode = scriptMode === 'normal' ? 'normal' : DEFAULT_SCRIPT_MODE;
  const fastModeEnabled = isTemplateV2 ? true : mode === 'fast';

  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(logDir, { recursive: true });

  const resolvedBlocksJson = path.resolve(metadataJsonPath);
  await assertFileExists(resolvedBlocksJson, 'blocks JSON');

  let blockCount = 0;
  try {
    const metadataRaw = await fs.readFile(resolvedBlocksJson, 'utf8');
    const parsed = JSON.parse(metadataRaw);
    if (parsed && Array.isArray(parsed.blocks)) {
      blockCount = parsed.blocks.length;
    }
  } catch (err: any) {
    log.warn('Failed to read metadata when preparing video parts', {
      projectId,
      metadataJsonPath: resolvedBlocksJson,
      error: err?.message || String(err),
    });
  }

  const resolvedImagesDir = await resolveImagesDirectory(workspaceRoot, imagesDir ?? null);
  if (blockCount > 0 && resolvedImagesDir) {
    try {
      const entries = await fs.readdir(resolvedImagesDir);
      const imageFiles = entries.filter((entry) => IMAGE_FILE_PATTERN.test(entry)).sort();
      if (imageFiles.length === 0) {
        log.warn('No prepared images found for video parts; proceeding without duplication', {
          projectId,
          imagesDir: resolvedImagesDir,
          requiredBlocks: blockCount,
        });
      } else if (imageFiles.length < blockCount) {
        const lastImageName = imageFiles[imageFiles.length - 1];
        const extension = path.extname(lastImageName);
        const lastImagePath = path.join(resolvedImagesDir, lastImageName);
        for (let index = imageFiles.length + 1; index <= blockCount; index += 1) {
          const targetName = `${String(index).padStart(3, '0')}${extension}`;
          const targetPath = path.join(resolvedImagesDir, targetName);
          await fs.copyFile(lastImagePath, targetPath);
        }
        log.warn('Extended prepared images to cover additional metadata blocks', {
          projectId,
          imagesDir: resolvedImagesDir,
          availableImages: imageFiles.length,
          requiredBlocks: blockCount,
          duplicatedSource: lastImageName,
        });
      }
    } catch (ensureErr: any) {
      log.warn('Failed to reconcile prepared images with metadata blocks', {
        projectId,
        imagesDir: resolvedImagesDir,
        requiredBlocks: blockCount,
        error: ensureErr?.message || String(ensureErr),
      });
    }
  }

  const dummyWorkspace = isDummyScriptWorkspace(scriptWorkspaceV2);

  if (clean) {
    const videoEffectsDir = path.join(workspaceRoot, 'video-basic-effects');
    try { await fs.rm(videoEffectsDir, { recursive: true, force: true }); } catch {}
  }

  if (dummyWorkspace) {
    await injectCtaIntoParts({
      projectId,
      workspaceRoot,
      logDir,
      include: includeCallToAction,
      targetLanguage,
      voiceExternalId: voiceExternalId ?? undefined,
    });
    const mainVideoPath = await writeDummyMainVideo(workspaceRoot);
    log.info('Video parts dummy workspace: produced placeholder clip', {
      projectId,
      workspaceRoot,
    });
    return {
      logPath: null,
      command: '(dummy basic-effects shortcut)',
      mainVideoPath,
      imagesDir: resolvedImagesDir,
    };
  }

  await injectCtaIntoParts({
    projectId,
    workspaceRoot,
    logDir,
    include: includeCallToAction,
    targetLanguage,
    voiceExternalId: voiceExternalId ?? undefined,
  });

  const args = [
    'run',
    '-s',
    'video:basic-effects',
    '--',
    `--workspace=${workspaceRoot}`,
    `--blocks-json=${resolvedBlocksJson}`,
    `--images-dir=${resolvedImagesDir}`,
    `--transition-name=${effectName}`,
  ];

  if (fastModeEnabled) {
    args.push('--fast');
  }

  const run = await runNpmCommand({
    projectId,
    cwd: scriptWorkspaceV2,
    workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
    args,
    logDir,
    logName: 'video-parts',
  });

  const mainVideoPath = path.join(workspaceRoot, 'video-basic-effects', 'final', `simple.${DEFAULT_RESOLUTION}.mp4`);
  await assertFileExists(mainVideoPath, 'main video output');

  log.info('Video parts rendering completed', {
    projectId,
    command: run.displayCommand,
    logPath: run.logPath,
    mainVideoPath,
    effectName,
    scriptMode: mode,
  });

  await writePartsTimeline({
    projectId,
    workspaceRoot,
    metadataPath: resolvedBlocksJson,
    imagesDir: resolvedImagesDir,
  });

  return {
    logPath: run.logPath,
    command: run.displayCommand,
    mainVideoPath,
    imagesDir: resolvedImagesDir,
  };
}

export async function buildFinalVideo(params: {
  projectId: string;
  workspaceRoot: string;
  commandsWorkspaceRoot?: string | null;
  logDir: string;
  scriptWorkspaceV2: string;
  metadataJsonPath: string;
  mainVideoPath: string;
  audioPath: string;
  captionsOverlayPath?: string | null;
  includeDefaultMusic?: boolean;
  addOverlay?: boolean;
  watermarkEnabled?: boolean;
  customOverlayPath?: string | null;
  customMusicPath?: string | null;
}) {
  const {
    projectId,
    workspaceRoot,
    commandsWorkspaceRoot,
    logDir,
    scriptWorkspaceV2,
    metadataJsonPath,
    mainVideoPath,
    audioPath,
    captionsOverlayPath = null,
    includeDefaultMusic = true,
    addOverlay = true,
    watermarkEnabled = true,
    customOverlayPath = null,
    customMusicPath = null,
  } = params;

  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(logDir, { recursive: true });

  const resolvedBlocksJson = path.resolve(metadataJsonPath);
  await assertFileExists(resolvedBlocksJson, 'blocks JSON');

  const resolvedMainVideo = path.resolve(mainVideoPath);
  await assertFileExists(resolvedMainVideo, 'main video input');

  const resolvedAudio = path.resolve(audioPath);
  await assertFileExists(resolvedAudio, 'narration audio');

  let backgroundMusicPath: string | null = null;
  if (includeDefaultMusic) {
    const custom = resolveCustomAssetPath(customMusicPath);
    if (custom) {
      try {
        await assertFileExists(custom, 'background music');
        backgroundMusicPath = custom;
      } catch (err: any) {
        log.warn('Custom background music not found; falling back to default', {
          projectId,
          path: custom,
          error: err?.message || String(err),
        });
      }
    }
    if (!backgroundMusicPath) {
      try {
        await assertFileExists(DEFAULT_BACKGROUND_MUSIC_PATH, 'background music');
        backgroundMusicPath = DEFAULT_BACKGROUND_MUSIC_PATH;
      } catch (err: any) {
        log.warn('Background music not found; continuing without it', {
          projectId,
          path: DEFAULT_BACKGROUND_MUSIC_PATH,
          error: err?.message || String(err),
        });
      }
    }
  }

  const overlayLayers: Array<{ path: string; opacity?: number; kind: 'sparkles' | 'custom' | 'watermark' | 'captions' }> = [];
  let overlayPath: string | null = null;
  if (addOverlay) {
    const customOverlay = resolveCustomAssetPath(customOverlayPath);
    if (customOverlay) {
      try {
        await assertFileExists(customOverlay, 'overlay');
        overlayPath = customOverlay;
        overlayLayers.push({ path: overlayPath, opacity: DEFAULT_OVERLAY_OPACITY, kind: 'custom' });
      } catch (err: any) {
        log.warn('Custom overlay not found; falling back to default', {
          projectId,
          path: customOverlay,
          error: err?.message || String(err),
        });
      }
    }
    if (!overlayPath) {
      try {
        await assertFileExists(DEFAULT_SPARKLES_OVERLAY_PATH, 'overlay');
        overlayPath = DEFAULT_SPARKLES_OVERLAY_PATH;
        overlayLayers.push({ path: overlayPath, opacity: DEFAULT_OVERLAY_OPACITY, kind: 'sparkles' });
      } catch (err: any) {
        log.warn('Overlay asset not found; continuing without it', {
          projectId,
          path: DEFAULT_SPARKLES_OVERLAY_PATH,
          error: err?.message || String(err),
        });
      }
    }
  }

  if (watermarkEnabled) {
    try {
      await assertFileExists(DEFAULT_WATERMARK_VIDEO_PATH, 'watermark overlay');
      overlayLayers.push({ path: DEFAULT_WATERMARK_VIDEO_PATH, opacity: DEFAULT_WATERMARK_OPACITY, kind: 'watermark' });
    } catch (err: any) {
      log.warn('Watermark asset not found; continuing without it', {
        projectId,
        path: DEFAULT_WATERMARK_VIDEO_PATH,
        error: err?.message || String(err),
      });
    }
  }

  if (captionsOverlayPath) {
    const candidate = path.resolve(captionsOverlayPath);
    try {
      await assertFileExists(candidate, 'captions overlay');
      overlayLayers.push({ path: candidate, kind: 'captions' });
    } catch (err: any) {
      log.warn('Captions overlay missing; skipping overlay', {
        projectId,
        path: candidate,
        error: err?.message || String(err),
      });
    }
  }

  const finalDir = path.join(workspaceRoot, 'video-merge-layers');
  await fs.mkdir(finalDir, { recursive: true });
  const baseName = `final.${DEFAULT_RESOLUTION}.mp4`;
  const captionsName = `final.${DEFAULT_RESOLUTION}.captions.mp4`;
  const watermarkedName = `final.${DEFAULT_RESOLUTION}.watermarked.mp4`;
  const captionsWatermarkedName = `final.${DEFAULT_RESOLUTION}.captions-watermarked.mp4`;

  let finalFileName = baseName;
  const hasWatermarkLayer = overlayLayers.some((layer) => layer.kind === 'watermark');
  const hasCaptionsLayer = overlayLayers.some((layer) => layer.kind === 'captions');
  if (hasCaptionsLayer && hasWatermarkLayer) {
    finalFileName = captionsWatermarkedName;
  } else if (hasCaptionsLayer) {
    finalFileName = captionsName;
  } else if (hasWatermarkLayer) {
    finalFileName = watermarkedName;
  }

  const finalVideoPath = path.join(finalDir, finalFileName);
  try { await fs.rm(finalVideoPath, { force: true }); } catch {}

  const args = [
    'run',
    '-s',
    'video:merge-layers',
    '--',
    DEFAULT_RESOLUTION,
    '--final',
    finalVideoPath,
    '--main-video',
    resolvedMainVideo,
    '--audio',
    resolvedAudio,
  ];

  if (backgroundMusicPath) {
    args.push('--background-music', backgroundMusicPath);
  }
  for (const layer of overlayLayers) {
    const value = layer.opacity !== undefined ? `${layer.path}@${layer.opacity}` : layer.path;
    const marked = layer.kind === 'captions' ? `${value}#once` : value;
    args.push('--overlay', marked);
  }

  const result = await runNpmCommand({
    projectId,
    cwd: scriptWorkspaceV2,
    workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
    args,
    logDir,
    logName: 'video',
  });

  await assertFileExists(finalVideoPath, 'final video output');

  log.info('Final video compilation completed', {
    projectId,
    command: result.displayCommand,
    logPath: result.logPath,
    finalVideoPath,
    mainVideoPath: resolvedMainVideo,
    audioPath: resolvedAudio,
    overlays: overlayLayers.map((layer) => ({
      path: layer.path,
      opacity: layer.opacity ?? null,
      kind: layer.kind,
    })),
    backgroundMusicPath,
  });

  return {
    logPath: result.logPath,
    command: result.displayCommand,
    finalVideoPath,
    overlays: overlayLayers.map((layer) => ({
      path: layer.path,
      opacity: layer.opacity ?? null,
      kind: layer.kind,
    })),
  };
}
