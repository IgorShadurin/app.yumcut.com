import path from 'path';
import { promises as fs } from 'fs';
import { ProjectStatus } from '@/shared/constants/status';
import { DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { log } from '../logger';
import {
  resolveCharacterImagePath,
} from '../character-cache';
import { generateImages } from '../images';
import { getLanguageProgress, uploadCharacterImage, registerGeneratedCharacter, setStatus, updateLanguageProgress, setFinalVideo } from '../db';
import { determineEffectName, resolveProjectLanguagesFromSnapshot } from './project-utils';
import { isDummyScriptWorkspace, writeDummyMainVideo, writeDummyMergedVideo, maybeWriteFakeDynamicCharacter } from '../dummy-fallbacks';
import type { DaemonConfig } from '../config';
import type { CreationSnapshot } from './types';
import { createHandledError } from './error';
import { ensureProjectScaffold, ensureLanguageWorkspace, ensureLanguageLogDir, ensureTemplateWorkspace } from '../language-workspace';
import type { ProjectScaffold } from '../language-workspace';
import { isCustomTemplateData } from '@/shared/templates/custom-data';

type ImagesPhaseArgs = {
  projectId: string;
  cfg: CreationSnapshot;
  jobPayload: Record<string, unknown>;
  daemonConfig: DaemonConfig;
};

export async function handleImagesPhase({ projectId, cfg, jobPayload, daemonConfig }: ImagesPhaseArgs) {
  const projectScaffold = await ensureProjectScaffold(projectId);
  const agentWorkspace = projectScaffold.workspaceRoot;
  const sharedImagesWorkspace = agentWorkspace;
  const customTemplate = isCustomTemplateData(cfg.template?.customData);

  try {
    if (customTemplate) {
      await handleCustomTemplateImages({ projectId, cfg, agentWorkspace, projectScaffold });
      return;
    }
    const dynamicSelected = (
      (jobPayload as any)?.characterSelection?.source === 'dynamic' ||
      (jobPayload as any)?.dynamicCharacter === true ||
      (cfg as any)?.characterSelection?.source === 'dynamic' ||
      (cfg as any)?.characterSelection?.type === 'dynamic'
    );
    const characterImagePath = dynamicSelected ? null : await resolveCharacterImagePath({
      projectId,
      imageUrl: cfg.characterSelection?.imageUrl ?? null,
    });
    const projectLanguages = resolveProjectLanguagesFromSnapshot(cfg);
    const progress = await getLanguageProgress(projectId).catch(() => null);
    const disabledLanguages = new Set((progress?.progress ?? []).filter((row) => row.disabled).map((row) => row.languageCode));
    const activeLanguages = projectLanguages.filter((code) => !disabledLanguages.has(code));
    if (activeLanguages.length === 0) {
      throw new Error('No active languages available for image generation');
    }
    const primaryLanguage = activeLanguages[0] ?? projectLanguages[0] ?? DEFAULT_LANGUAGE;
    const primaryInfo = await ensureLanguageWorkspace(projectId, primaryLanguage);
    const metadataJsonPath = path.join(primaryInfo.languageWorkspace, 'metadata', 'transcript-blocks.json');
    let stylePromptPath: string | null = null;
    const templateStylePrompt = cfg.template?.artStyle?.prompt?.trim();
    if (templateStylePrompt) {
      const promptsDir = path.join(primaryInfo.languageWorkspace, 'prompts');
      await fs.mkdir(promptsDir, { recursive: true });
      stylePromptPath = path.join(promptsDir, 'image-style.txt');
      await fs.writeFile(stylePromptPath, templateStylePrompt, 'utf8');
    } else if (cfg.template) {
      log.warn('⚠️ Template missing art style prompt; using default', {
        projectId,
        templateId: cfg.template.id,
        templateCode: cfg.template.code,
      });
    }
    const imagesLogDir = await ensureLanguageLogDir(primaryInfo, 'images');
    const imagesResult = await generateImages({
      projectId,
      workspaceRoot: sharedImagesWorkspace,
      logDir: imagesLogDir,
      scriptWorkspaceV2: daemonConfig.scriptWorkspaceV2,
      metadataJsonPath,
      characterImagePath,
      stylePromptPath,
      newCharacter: dynamicSelected,
      llmModel: undefined,
      llmProvider: undefined,
      generator: 'v2',
      scriptMode: daemonConfig.scriptMode,
    });
    if (dynamicSelected) {
      await maybeWriteFakeDynamicCharacter(sharedImagesWorkspace);
      try {
        const uniqueCharPath = path.join(sharedImagesWorkspace, 'qwen-image-edit', 'unique-character.jpg');
        await fs.access(uniqueCharPath);
        const uploaded = await uploadCharacterImage(projectId, uniqueCharPath);
        await registerGeneratedCharacter(projectId, { path: uploaded.path, url: uploaded.url });
        log.info('Generated character uploaded and linked', { projectId, path: uploaded.path, url: uploaded.url });
      } catch (e: any) {
        log.warn('Failed to register generated character', { projectId, error: e?.message || String(e) });
      }
    }
    const effectName = determineEffectName(projectId, cfg.template ?? null);
    const dummyVideoWorkspace = isDummyScriptWorkspace(daemonConfig.scriptWorkspaceV2);
    if (dummyVideoWorkspace) {
      const includeDefaultMusic = typeof cfg.includeDefaultMusic === 'boolean' ? cfg.includeDefaultMusic : true;
      const addOverlay = typeof cfg.addOverlay === 'boolean' ? cfg.addOverlay : true;

      const videoPartsLogs: Record<string, string | null> = {};
      const mainVideoPaths: Record<string, string> = {};
      const finalVideoPaths: Record<string, string> = {};
      const overlaysByLanguage: Record<string, unknown> = {};

      for (const languageCode of activeLanguages) {
        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const workspaceRoot = languageInfo.languageWorkspace;
        const placeholderMain = await writeDummyMainVideo(workspaceRoot);
        const placeholderFinal = await writeDummyMergedVideo(workspaceRoot);
        const finalPath = placeholderFinal || placeholderMain;
        videoPartsLogs[languageCode] = null;
        mainVideoPaths[languageCode] = placeholderMain;
        finalVideoPaths[languageCode] = finalPath;
        overlaysByLanguage[languageCode] = [];
        try {
          await updateLanguageProgress(projectId, {
            languageCode,
            transcriptionDone: true,
            captionsDone: true,
            videoPartsDone: true,
            finalVideoDone: true,
          });
        } catch (updateErr: any) {
          log.warn('Failed to persist language progress in image fallback', {
            projectId,
            languageCode,
            error: updateErr?.message || String(updateErr),
          });
        }
        try {
          await setFinalVideo(projectId, finalPath, languageCode);
        } catch (assetErr: any) {
          log.warn('Failed to register fallback final video asset', {
            projectId,
            languageCode,
            error: assetErr?.message || String(assetErr),
          });
        }
      }

      await setStatus(projectId, ProjectStatus.ProcessVideoPartsGeneration, 'Images generated', {
        imagesWorkspace: sharedImagesWorkspace,
        imagesLog: imagesResult.logPath,
        completedLanguages: activeLanguages,
        failedLanguages: Array.from(disabledLanguages),
        pendingLanguages: [],
      });
      await setStatus(projectId, ProjectStatus.ProcessVideoMain, 'Video parts rendered', {
        videoPartsWorkspace: agentWorkspace,
        videoPartsLogs,
        mainVideoPaths,
        effectName,
        completedLanguages: activeLanguages,
        failedLanguages: Array.from(disabledLanguages),
        pendingLanguages: [],
      });
      await setStatus(projectId, ProjectStatus.Done, 'Video ready', {
        videoWorkspace: agentWorkspace,
        videoLogs: videoPartsLogs,
        finalVideoPaths,
        effectName,
        includeDefaultMusic,
        addOverlay,
        watermarkEnabled: cfg.watermarkEnabled,
        overlays: overlaysByLanguage,
        completedLanguages: activeLanguages,
        failedLanguages: Array.from(disabledLanguages),
      });
      return;
    }

    await setStatus(projectId, ProjectStatus.ProcessVideoPartsGeneration, 'Images generated', {
      imagesWorkspace: sharedImagesWorkspace,
      imagesWorkspaceRoot: agentWorkspace,
      imagesLog: imagesResult.logPath,
      imagesLanguage: primaryLanguage,
      sharedImagesLogDir: imagesLogDir,
      failedLanguages: Array.from(disabledLanguages),
    });
  } catch (err: any) {
    log.error('Image generation failed', {
      projectId,
      error: err?.message || String(err),
    });
    await setStatus(projectId, ProjectStatus.Error, 'Image generation failed');
    throw createHandledError('Image generation failed', err);
  }
}

async function handleCustomTemplateImages({ projectId, cfg, agentWorkspace, projectScaffold }: { projectId: string; cfg: CreationSnapshot; agentWorkspace: string; projectScaffold: ProjectScaffold }) {
  if (!cfg.template || !isCustomTemplateData(cfg.template.customData)) {
    throw new Error('handleCustomTemplateImages requires custom template metadata');
  }
  const templateWorkspace = await ensureTemplateWorkspace(projectId, cfg.template.code ?? null, cfg.template.id ?? null);
  const templateImagesDir = await ensureTemplateImagesAvailable(templateWorkspace.templateWorkspace);
  if (!templateImagesDir) {
    throw new Error('Custom template images not found');
  }
  const progress = await getLanguageProgress(projectId).catch(() => null);
  const failedLanguages = progress ? progress.progress.filter((row) => row.disabled).map((row) => row.languageCode) : [];
  await setStatus(projectId, ProjectStatus.ProcessVideoPartsGeneration, 'Template images prepared', {
    imagesWorkspace: templateImagesDir,
    imagesWorkspaceRoot: agentWorkspace,
    imagesLog: null,
    imagesLanguage: null,
    sharedImagesLogDir: null,
    templateImagesDir,
    templateWorkspace: templateWorkspace.templateWorkspace,
    failedLanguages,
  });
}

async function ensureTemplateImagesAvailable(templateWorkspaceDir: string): Promise<string | null> {
  const imagesDir = path.join(templateWorkspaceDir, 'images');
  try {
    const stats = await fs.stat(imagesDir);
    if (!stats.isDirectory()) return null;
  } catch (err) {
    return null;
  }
  const entries = await fs.readdir(imagesDir);
  const hasImages = entries.some((entry) => /\.(?:png|jpe?g|webp)$/i.test(entry));
  if (!hasImages) {
    return null;
  }
  return imagesDir;
}
