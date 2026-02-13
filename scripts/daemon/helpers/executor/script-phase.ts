import path from 'path';
import { promises as fs } from 'fs';
import { ProjectStatus } from '@/shared/constants/status';
import { normalizeLanguageList, DEFAULT_LANGUAGE, TargetLanguageCode } from '@/shared/constants/languages';
import { log } from '../logger';
import { archiveInitialSuccess, archiveRefinementSuccess, archiveInitialError, archiveRefinementError } from '../script-archive';
import { generateScript, refineScript, PromptToTextError } from '../prompt-to-text';
import { upsertScript, getScriptText, setStatus, markLanguageFailure, addImageAsset } from '../db';
import { translateScript } from '../translate';
import type { CreationSnapshot } from './types';
import { createHandledError } from './error';
import { languageNameForCli, resolveProjectLanguagesFromSnapshot } from './project-utils';
import { ensureLanguageWorkspace, ensureTemplateWorkspace, ensureLanguageLogDir } from '../language-workspace';
import { runTemplateLaunch, loadTemplateLaunchSnapshotIfExists, type LaunchSnapshot } from '../template-launch';
import { isCustomTemplateData } from '@/shared/templates/custom-data';
import { getDaemonConfig } from './context';
import { generateMetadata } from '../metadata';
import { rememberTemplateOriginalPath, saveTemplateOriginalScript } from '../template-original';

type ScriptPhaseArgs = {
  projectId: string;
  cfg: CreationSnapshot;
  jobPayload: Record<string, unknown>;
  creationGuidance: string;
  avoidanceGuidance: string;
};

type CustomTemplateScriptArgs = {
  projectId: string;
  cfg: CreationSnapshot;
  durationSeconds: number | null;
  prompt: string | null;
  featureWarnings: string[];
  userText: string | null;
  userTextRequested: boolean;
};

function extractDurationSeconds(jobPayload: Record<string, unknown>, cfg: CreationSnapshot): number | null {
  const raw = typeof jobPayload.durationSeconds === 'number' ? jobPayload.durationSeconds : cfg.durationSeconds;
  if (typeof raw !== 'number' || Number.isNaN(raw) || !Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

export async function handleScriptPhase(args: ScriptPhaseArgs) {
  const { projectId, cfg, jobPayload, creationGuidance, avoidanceGuidance } = args;
  const reason = typeof jobPayload.reason === 'string' ? jobPayload.reason : null;
  const requestText = typeof jobPayload.requestText === 'string' ? jobPayload.requestText : null;
  const prompt = typeof jobPayload.prompt === 'string' ? jobPayload.prompt : null;
  const rawScript = typeof jobPayload.rawScript === 'string' ? jobPayload.rawScript : null;
  const useExactExplicit = jobPayload.useExactTextAsScript === true;
  const durationSeconds = extractDurationSeconds(jobPayload, cfg);
  const mustHave = creationGuidance || undefined;
  const avoid = avoidanceGuidance || undefined;
  const isRefinement = reason === 'script_refinement';
  const propagateTranslations = jobPayload.refinePropagateTranslations === true;
  const useExact = !isRefinement && (useExactExplicit || cfg.useExactTextAsScript);
  const payloadLanguages = Array.isArray(jobPayload.languages)
    ? (jobPayload.languages as unknown[]).filter((code): code is string => typeof code === 'string' && code.trim().length > 0)
    : [];
  const requestedLanguage = typeof jobPayload.languageCode === 'string' && jobPayload.languageCode.trim().length > 0
    ? jobPayload.languageCode.trim().toLowerCase()
    : null;
  const targetLanguageCode =
    requestedLanguage
    ?? (payloadLanguages.length === 1 ? payloadLanguages[0].toLowerCase() : null)
    ?? (typeof cfg.targetLanguage === 'string' && cfg.targetLanguage.trim().length > 0 ? cfg.targetLanguage.toLowerCase() : 'en');
  const languageLabel = languageNameForCli(targetLanguageCode);
  const cfgLanguagesRaw = Array.isArray((cfg as any).languages) && (cfg as any).languages.length > 0
    ? (cfg as any).languages
    : [cfg.targetLanguage];
  let projectLanguages = normalizeLanguageList(cfgLanguagesRaw, DEFAULT_LANGUAGE);
  const normalizedSourceLanguage = normalizeLanguageList(targetLanguageCode, projectLanguages[0] ?? DEFAULT_LANGUAGE)[0] ?? DEFAULT_LANGUAGE;
  if (!projectLanguages.includes(normalizedSourceLanguage)) {
    projectLanguages = [normalizedSourceLanguage, ...projectLanguages] as TargetLanguageCode[];
    projectLanguages = Array.from(new Set(projectLanguages)) as TargetLanguageCode[];
  }
  const translationTargets = !isRefinement
    ? projectLanguages.filter((code) => code !== normalizedSourceLanguage)
    : propagateTranslations
      ? projectLanguages.filter((code) => code !== normalizedSourceLanguage)
      : [];
  const failedTranslations: string[] = [];
  const successfulTranslations: string[] = [];
  const customTemplateData = isCustomTemplateData(cfg.template?.customData) ? cfg.template!.customData : null;
  const templateFeatureWarnings: string[] = [];
  const normalizedPrompt = typeof prompt === 'string' && prompt.trim().length > 0 ? prompt.trim() : null;
  let effectiveCustomPrompt = normalizedPrompt;
  if (customTemplateData) {
    if (!customTemplateData.supportsScriptPrompt) {
      const guidanceRequested = Boolean((creationGuidance && creationGuidance.trim()) || (avoidanceGuidance && avoidanceGuidance.trim()));
      if (guidanceRequested) {
        templateFeatureWarnings.push('Script creation guidance is ignored for this custom template.');
      }
    }
    if (!customTemplateData.supportsExactText && (cfg.useExactTextAsScript || useExactExplicit)) {
      templateFeatureWarnings.push('Exact script mode was requested but is not supported for this custom template.');
    }
    const characterSelectionRequested = Boolean(cfg.characterSelection?.type) || Boolean((jobPayload as any)?.characterSelection);
    if (!customTemplateData.supportsCustomCharacters && characterSelectionRequested) {
      templateFeatureWarnings.push('Custom character selection is ignored for this custom template.');
    }
    if (cfg.autoApproveScript === false) {
      templateFeatureWarnings.push('Script auto-approval is always enabled for this custom template.');
    }
    if (cfg.autoApproveAudio === false) {
      templateFeatureWarnings.push('Audio auto-approval is always enabled for this custom template.');
    }
  }
  const startMessage = customTemplateData
    ? 'Preparing custom template scripts'
    : isRefinement
      ? 'Refining script with AI'
      : useExact
        ? 'Using provided script text'
        : 'Generating script with AI';

  await setStatus(projectId, ProjectStatus.ProcessScript, startMessage);

  try {
    if (customTemplateData) {
      await handleCustomTemplateScriptPhase({
        projectId,
        cfg,
        durationSeconds,
        prompt: effectiveCustomPrompt,
        featureWarnings: templateFeatureWarnings,
        userText: useExact ? rawScript : null,
        userTextRequested: useExact,
      });
      return;
    }
    let scriptText: string;
    let archiveTask: (() => Promise<void>) | null = null;
    if (isRefinement) {
      if (!requestText || !requestText.trim()) {
        throw new Error('Missing refinement instructions');
      }
      const languageInfo = await ensureLanguageWorkspace(projectId, targetLanguageCode);
      const existingScript = await getScriptText(projectId, targetLanguageCode);
      if (!existingScript || !existingScript.trim()) {
        throw new Error('Existing script not found for refinement');
      }
      log.info('Running script refinement', {
        projectId,
        requestPreview: requestText.slice(0, 200),
        durationSeconds,
      });
      const refinement = await refineScript({ script: existingScript, instructions: requestText, durationSeconds, language: languageLabel || undefined, workspaceRoot: languageInfo.workspaceRoot });
      scriptText = refinement.text;
      archiveTask = () => archiveRefinementSuccess({
        projectId,
        languageCode: targetLanguageCode,
        command: refinement.command,
        notes: requestText ?? '',
        durationSeconds,
        output: scriptText,
      });
    } else if (useExact) {
      if (!rawScript || !rawScript.trim()) {
        throw new Error('Exact script text is empty');
      }
      scriptText = rawScript.trim();
      archiveTask = () => archiveInitialSuccess({
        projectId,
        languageCode: normalizedSourceLanguage,
        command: 'useExactTextAsScript (no CLI invocation)',
        prompt: '(Exact script supplied by user)',
        durationSeconds,
        language: languageLabel,
        mustHave: mustHave ?? null,
        avoid: avoid ?? null,
        output: scriptText,
      });
    } else {
      const effectivePrompt = (prompt || '').trim();
      if (!effectivePrompt) {
        throw new Error('Prompt is required for script generation');
      }
      log.info('Running script generation', {
        projectId,
        promptPreview: effectivePrompt.slice(0, 200),
        durationSeconds,
        hasGuidance: !!(mustHave || avoid),
        language: languageLabel,
      });
      const languageInfo = await ensureLanguageWorkspace(projectId, targetLanguageCode);
      const generation = await generateScript({ prompt: effectivePrompt, durationSeconds, mustHave, avoid, language: languageLabel, workspaceRoot: languageInfo.workspaceRoot });
      scriptText = generation.text;
      archiveTask = () => archiveInitialSuccess({
        projectId,
        languageCode: normalizedSourceLanguage,
        command: generation.command,
        prompt: effectivePrompt,
        durationSeconds,
        language: languageLabel,
        mustHave: mustHave ?? null,
        avoid: avoid ?? null,
        output: scriptText,
      });
    }

    log.info('Script produced', {
      projectId,
      mode: isRefinement ? 'refine' : useExact ? 'exact' : 'generate',
      characters: scriptText.length,
    });
    if (archiveTask) {
      try { await archiveTask(); } catch (e) { log.warn('Archive write failed', { projectId, error: (e as any)?.message || String(e) }); }
    }
    await upsertScript(projectId, scriptText, targetLanguageCode);

    if (translationTargets.length > 0) {
      await Promise.all(
        translationTargets.map(async (languageCode) => {
          try {
            log.info('Translating script for language', {
              projectId,
              sourceLanguage: normalizedSourceLanguage,
              targetLanguage: languageCode,
            });
            const translated = await translateScript({
              projectId,
              sourceLanguage: normalizedSourceLanguage,
              targetLanguage: languageCode,
              sourceText: scriptText,
            });
            await upsertScript(projectId, translated, languageCode);
            successfulTranslations.push(languageCode);
            log.info('Script translation completed', {
              projectId,
              targetLanguage: languageCode,
              characters: translated.length,
            });
          } catch (translationErr: any) {
            failedTranslations.push(languageCode);
            log.error('Script translation failed for language', {
              projectId,
              targetLanguage: languageCode,
              error: translationErr?.message || String(translationErr),
            });
            await markLanguageFailure(projectId, languageCode, 'script', translationErr?.message || String(translationErr));
          }
        }),
      );
    }
    if (isRefinement && !propagateTranslations) {
      log.info('Skipping translation for refinement per request', {
        projectId,
        sourceLanguage: normalizedSourceLanguage,
      });
    }

    const activeLanguages = projectLanguages.filter((code) => !failedTranslations.includes(code));
    if (activeLanguages.length === 0) {
      log.error('Script phase completed with no active languages', { projectId });
      const failure = new Error('Script generation failed for all project languages');
      throw createHandledError('Script generation failed', failure);
    }

    const shouldAutoApprove = cfg.autoApproveScript || (!isRefinement && useExact);
    if (shouldAutoApprove) {
      const message = isRefinement
        ? 'Refined script auto-approved'
        : useExact
          ? 'Script imported and auto-approved'
          : 'Script auto-approved';
      await setStatus(projectId, ProjectStatus.ProcessAudio, message, {
        primaryLanguage: normalizedSourceLanguage,
        scriptLanguages: activeLanguages,
        translatedLanguages: successfulTranslations,
        failedLanguages: failedTranslations,
      });
    } else {
      const message = isRefinement ? 'Refined script ready for validation' : 'Script ready for validation';
      await setStatus(projectId, ProjectStatus.ProcessScriptValidate, message, {
        primaryLanguage: normalizedSourceLanguage,
        scriptLanguages: activeLanguages,
        translatedLanguages: successfulTranslations,
        failedLanguages: failedTranslations,
      });
    }
  } catch (err: any) {
    const failureMessage = reason === 'script_refinement'
      ? 'Script refinement failed'
      : useExact
        ? 'Script import failed'
        : 'Script generation failed';
    log.error('Script phase failed', {
      projectId,
      reason,
      error: err?.message || String(err),
    });
    if (err instanceof PromptToTextError) {
      if (isRefinement) {
        await archiveRefinementError(projectId, targetLanguageCode, err.command, err.message, requestText ?? '');
      } else {
        await archiveInitialError(projectId, normalizedSourceLanguage, err.command, err.message);
      }
    }
    await setStatus(projectId, ProjectStatus.Error, failureMessage);
    throw createHandledError(failureMessage, err);
  }
}

async function handleCustomTemplateScriptPhase({ projectId, cfg, durationSeconds, prompt, featureWarnings, userText, userTextRequested }: CustomTemplateScriptArgs) {
  const template = cfg.template;
  if (!template || !isCustomTemplateData(template.customData)) {
    throw new Error('Custom template handler invoked without template metadata');
  }
  const daemonConfig = getDaemonConfig();
  const languages = resolveProjectLanguagesFromSnapshot(cfg);
  if (languages.length === 0) {
    throw new Error('Custom template requires at least one language');
  }
  const normalizedPrompt = typeof prompt === 'string' && prompt.trim().length > 0 ? prompt.trim() : null;
  const normalizedUserText = typeof userText === 'string' && userText.trim().length > 0 ? userText.trim() : null;
  const userTextAllowed = userTextRequested && !!normalizedUserText;
  const useUserTextMode = userTextAllowed;
  if (useUserTextMode) {
    if (!normalizedUserText) {
      throw new Error('Custom template exact script text is empty');
    }
  } else if (!normalizedPrompt) {
    throw new Error('Custom template requires a prompt before launch');
  }
  const effectiveDuration = Math.max(1, durationSeconds ?? cfg.durationSeconds ?? 60);
  const templateWorkspace = await ensureTemplateWorkspace(projectId, template.code ?? null, template.id ?? null);
  const userTextPath = useUserTextMode && normalizedUserText ? await persistTemplateUserText(templateWorkspace.templateWorkspace, normalizedUserText) : null;
  const templateJsonRelative = path.join('scripts/template-launch/templates', template.customData.customId, 'template.json');
  const templateModuleRelative = templateJsonRelative.replace(/\.json$/i, '.ts');

  const cached = await loadCachedTemplateSnapshot(templateWorkspace.templateWorkspace, languages);
  let snapshot: LaunchSnapshot;
  let resultPath: string;
  let logPath: string | null = null;
  let usedCache = false;

  if (featureWarnings.length > 0) {
    log.warn('Custom template feature warnings', {
      projectId,
      templateId: template.id,
      templateCode: template.code,
      warnings: featureWarnings,
      autoApproveScriptEnforced: cfg.autoApproveScript === false,
      autoApproveAudioEnforced: cfg.autoApproveAudio === false,
    });
  }

  if (cached) {
    snapshot = cached.snapshot;
    resultPath = cached.resultPath;
    usedCache = true;
    log.info('Reusing cached custom template output', {
      projectId,
      templateId: template.id,
      templateCode: template.code,
      customId: template.customData.customId,
      templateWorkspace: templateWorkspace.templateWorkspace,
      resultPath,
    });
  } else {
    const launch = await runTemplateLaunch({
      projectId,
      scriptWorkspaceV2: daemonConfig.scriptWorkspaceV2,
      templatePath: templateJsonRelative,
      modulePath: templateModuleRelative,
      workspaceDir: templateWorkspace.templateWorkspace,
      commandsWorkspaceRoot: templateWorkspace.workspaceRoot,
      logDir: templateWorkspace.templateLogsRoot,
      durationSeconds: effectiveDuration,
      languages,
      userPrompt: useUserTextMode ? null : normalizedPrompt,
      userTextPath,
      autoApprove: true,
    });
    snapshot = launch.snapshot;
    resultPath = launch.resultPath;
    logPath = launch.logPath;
  }

  const templateImages = await syncTemplateImages(snapshot.images, templateWorkspace.templateWorkspace);
  const uploadedTemplateImages = await uploadTemplateImages(projectId, templateImages.files);
  const templateImageMetadata = mergeTemplateImageMetadata(snapshot.imageMetadata, uploadedTemplateImages);
  const successfulLanguages: string[] = [];
  const failedLanguages: string[] = [];

  for (const languageCode of languages) {
    const scriptPath = resolveSnapshotScriptPath(snapshot.textScript, languageCode);
    if (!scriptPath) {
      await markLanguageFailure(projectId, languageCode, 'script', 'Template launch did not return script text');
      failedLanguages.push(languageCode);
      continue;
    }
    try {
      const scriptBody = await fs.readFile(scriptPath, 'utf8');
      if (!scriptBody.trim()) {
        await markLanguageFailure(projectId, languageCode, 'script', 'Template launch returned an empty script');
        failedLanguages.push(languageCode);
        continue;
      }
      const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
      const transcriptPath = path.join(languageInfo.languageWorkspace, 'transcript.txt');
      await fs.writeFile(transcriptPath, scriptBody, 'utf8');
      const localOriginalPath = await saveTemplateOriginalScript(languageInfo, scriptBody);
      await rememberTemplateOriginalPath(languageInfo, localOriginalPath);
      await upsertScript(projectId, scriptBody, languageCode);
      successfulLanguages.push(languageCode);
    } catch (err: any) {
      await markLanguageFailure(projectId, languageCode, 'script', err?.message || 'Failed to persist script');
      failedLanguages.push(languageCode);
    }
  }

  if (successfulLanguages.length === 0) {
    throw new Error('Template launcher produced no usable scripts');
  }

  log.info('Custom template scripts generated', {
    projectId,
    templateId: template.id,
    templateCode: template.code,
    customId: template.customData.customId,
    successfulLanguages,
    failedLanguages,
    templateWorkspace: templateWorkspace.templateWorkspace,
    templateLogPath: logPath,
    templateResultPath: resultPath,
    templateImagesDir: templateImages.dir,
    templateImagesCopied: templateImages.files.length,
    templateImagesPaths: templateImages.files,
    templateImageAssets: uploadedTemplateImages,
    templateImageMetadata,
    templateFeatureWarnings: featureWarnings,
    templateLaunchCached: usedCache,
    templateUserInputMode: useUserTextMode ? 'user-text' : 'user-prompt',
    templateUserTextPath: userTextPath,
  });

  const shouldAutoApprove = true; // Custom templates bypass manual validation regardless of user toggle
  const primaryLanguage = successfulLanguages[0] ?? languages[0];
  const statusPayload = {
    primaryLanguage,
    scriptLanguages: successfulLanguages,
    failedLanguages,
    templateWorkspace: templateWorkspace.templateWorkspace,
    templateLogsRoot: templateWorkspace.templateLogsRoot,
    templateLaunchLog: logPath,
    templateLaunchResult: resultPath,
    templateImagesDir: templateImages.dir,
    templateImagesPaths: templateImages.files,
    templateImageAssets: uploadedTemplateImages,
    templateImageMetadata,
    templateFeatureWarnings: featureWarnings,
    templateLaunchCached: usedCache,
    templateUserInputMode: useUserTextMode ? 'user-text' : 'user-prompt',
    templateUserTextPath: userTextPath,
  } as const;

  if (shouldAutoApprove) {
    await setStatus(projectId, ProjectStatus.ProcessAudio, 'Custom template script auto-approved', statusPayload);
  } else {
    await setStatus(projectId, ProjectStatus.ProcessScriptValidate, 'Custom template script ready for validation', statusPayload);
  }
}

function resolveSnapshotScriptPath(map: Record<string, string>, languageCode: string): string | null {
  const normalized = (languageCode ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (map[normalized]) return map[normalized];
  const parts = normalized.split('-');
  if (parts.length > 1 && map[parts[0]]) {
    return map[parts[0]];
  }
  return null;
}

async function loadCachedTemplateSnapshot(templateWorkspaceDir: string, languages: string[]): Promise<{ snapshot: LaunchSnapshot; resultPath: string } | null> {
  const resultPath = path.join(templateWorkspaceDir, 'result.json');
  const snapshot = await loadTemplateLaunchSnapshotIfExists(resultPath);
  if (!snapshot) return null;
  for (const languageCode of languages) {
    const scriptPath = resolveSnapshotScriptPath(snapshot.textScript, languageCode);
    if (!scriptPath) return null;
    try {
      await fs.access(scriptPath);
    } catch {
      return null;
    }
  }
  return { snapshot, resultPath };
}

async function persistTemplateUserText(templateWorkspaceDir: string, contents: string): Promise<string> {
  const inputDir = path.join(templateWorkspaceDir, 'input');
  await fs.mkdir(inputDir, { recursive: true });
  const filePath = path.join(inputDir, 'user-text.txt');
  await fs.writeFile(filePath, contents, 'utf8');
  return filePath;
}

async function syncTemplateImages(sourceImages: string[], templateWorkspaceDir: string): Promise<{ dir: string | null; files: string[] }> {
  if (!Array.isArray(sourceImages) || sourceImages.length === 0) {
    return { dir: null, files: [] };
  }
  const imagesDir = path.join(templateWorkspaceDir, 'images');
  await fs.mkdir(imagesDir, { recursive: true });
  const copied: string[] = [];
  let counter = 1;
  for (const imagePath of sourceImages) {
    const resolvedSource = path.resolve(imagePath);
    try {
      await fs.access(resolvedSource);
    } catch (err: any) {
      log.warn('Template image missing; skipping copy', {
        source: resolvedSource,
        error: err?.message || String(err),
      });
      continue;
    }
    const ext = path.extname(resolvedSource) || '.jpg';
    const targetName = `${String(counter).padStart(3, '0')}${ext}`;
    const targetPath = path.join(imagesDir, targetName);
    try {
      await fs.copyFile(resolvedSource, targetPath);
      copied.push(targetPath);
      counter += 1;
    } catch (err: any) {
      log.warn('Failed to copy template image', {
        source: resolvedSource,
        target: targetPath,
        error: err?.message || String(err),
      });
    }
  }
  if (copied.length === 0) {
    return { dir: null, files: [] };
  }
  return { dir: imagesDir, files: copied };
}

type UploadedTemplateImage = {
  id: string;
  path: string;
  url: string;
  image: string;
};

async function uploadTemplateImages(projectId: string, files: string[]): Promise<UploadedTemplateImage[]> {
  if (!Array.isArray(files) || files.length === 0) return [];
  const uploaded: UploadedTemplateImage[] = [];
  const seen = new Set<string>();
  for (const filePath of files) {
    const image = path.basename(filePath);
    if (seen.has(image)) {
      throw new Error(`Duplicate template image filename detected: ${image}`);
    }
    seen.add(image);
    const asset = await addImageAsset(projectId, filePath);
    uploaded.push({ id: asset.id, path: asset.path, url: asset.url, image });
  }
  return uploaded;
}

function mergeTemplateImageMetadata(
  metadata: LaunchSnapshot['imageMetadata'],
  assets: UploadedTemplateImage[],
) {
  if (!metadata || metadata.length === 0) return [];
  const assetByName = new Map<string, UploadedTemplateImage>();
  for (const asset of assets) {
    assetByName.set(asset.image, asset);
  }
  return metadata.map((entry, index) => {
    const imageName = path.basename(entry.image);
    const asset = assetByName.get(imageName);
    if (!asset) {
      throw new Error(`Missing uploaded image for metadata entry ${index} (${entry.image})`);
    }
    return {
      image: entry.image,
      model: entry.model,
      prompt: entry.prompt,
      sentence: entry.sentence ?? null,
      size: entry.size ?? null,
      url: asset.url,
      path: asset.path,
      assetId: asset.id,
    };
  });
}

async function ensureTranscriptBlocks(projectId: string, languageInfo: Awaited<ReturnType<typeof ensureLanguageWorkspace>>, daemonConfig: ReturnType<typeof getDaemonConfig>): Promise<string | null> {
  const metadataDir = path.join(languageInfo.languageWorkspace, 'metadata');
  const metadataPath = path.join(metadataDir, 'transcript-blocks.json');
  try {
    const existing = await readMetadataBlocks(metadataPath);
    if (existing > 0) {
      return metadataPath;
    }
  } catch {}
  await fs.mkdir(metadataDir, { recursive: true });
  const logDir = await ensureLanguageLogDir(languageInfo, 'metadata');
  const metadataResult = await generateMetadata({
    projectId,
    workspaceRoot: languageInfo.languageWorkspace,
    commandsWorkspaceRoot: languageInfo.workspaceRoot,
    scriptWorkspaceV2: daemonConfig.scriptWorkspaceV2,
    logDir,
    targetBlockCount: null,
    scriptMode: daemonConfig.scriptMode,
  });
  return metadataResult.outputPath;
}

async function readMetadataBlocks(filePath: string): Promise<number> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed && Array.isArray(parsed.blocks)) {
    return parsed.blocks.length;
  }
  return 0;
}
