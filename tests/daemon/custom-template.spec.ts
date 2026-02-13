import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { buildDaemonEnvContent } from './helpers/env';

const setStatus = vi.fn<(
  projectId: string,
  status: unknown,
  message?: string | null,
  extra?: Record<string, unknown> | undefined
) => Promise<void>>(async () => {});
const upsertScript = vi.fn<(projectId: string, text: string, languageCode?: string | undefined) => Promise<void>>(async () => {});
const addImageAsset = vi.fn<(projectId: string, filePath: string) => Promise<{ id: string; path: string; url: string; localPath: string }>>(async () => ({
  id: 'img_1',
  path: '/stored/image.jpg',
  url: 'https://storage.example/image.jpg',
  localPath: '/tmp/image.jpg',
}));
const markLanguageFailure = vi.fn<(
  projectId: string,
  languageCode: string,
  phase: string,
  reason: string
) => Promise<void>>(async () => {});
const runTemplateLaunch = vi.fn();
const loadTemplateLaunchSnapshotIfExists = vi.fn();
const generateMetadata = vi.fn();

vi.mock('../../scripts/daemon/helpers/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../scripts/daemon/helpers/script-archive', () => ({
  archiveInitialSuccess: vi.fn(),
  archiveRefinementSuccess: vi.fn(),
  archiveInitialError: vi.fn(),
  archiveRefinementError: vi.fn(),
}));

vi.mock('../../scripts/daemon/helpers/prompt-to-text', () => ({
  generateScript: vi.fn(),
  refineScript: vi.fn(),
  PromptToTextError: class PromptToTextError extends Error {},
}));

vi.mock('../../scripts/daemon/helpers/translate', () => ({
  translateScript: vi.fn(),
}));

vi.mock('../../scripts/daemon/helpers/db', () => ({
  upsertScript,
  getScriptText: vi.fn(),
  setStatus,
  markLanguageFailure,
  addImageAsset,
}));

vi.mock('../../scripts/daemon/helpers/template-launch', () => ({
  runTemplateLaunch,
  loadTemplateLaunchSnapshotIfExists,
  __templateLaunchInternals: {},
}));

vi.mock('../../scripts/daemon/helpers/metadata', () => ({
  generateMetadata,
}));

describe('custom template prompts', () => {
  let tmpRoot: string;
  let envPath: string;
  let handleScriptPhase: typeof import('../../scripts/daemon/helpers/executor/script-phase').handleScriptPhase;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-custom-template-'));
    const projectsWorkspace = path.join(tmpRoot, 'projects');
    await fs.mkdir(projectsWorkspace, { recursive: true });
    envPath = path.join(tmpRoot, '.daemon.env');
    const envContent = buildDaemonEnvContent({
      apiBaseUrl: 'http://127.0.0.1:4010',
      storageBaseUrl: 'http://127.0.0.1:5010',
      password: 'secret',
      projectsWorkspace,
      overrides: { logsSilent: '0' },
    });
    await fs.writeFile(envPath, envContent, 'utf8');
    process.env.DAEMON_ENV_FILE = envPath;

    vi.resetModules();
    const configModule = await import('../../scripts/daemon/helpers/config');
    configModule.__resetDaemonConfigForTests();
    const config = configModule.loadConfig();
    const contextModule = await import('../../scripts/daemon/helpers/executor/context');
    contextModule.__setDaemonConfigForTests(config);
    ({ handleScriptPhase } = await import('../../scripts/daemon/helpers/executor/script-phase'));

    setStatus.mockClear();
    upsertScript.mockClear();
    markLanguageFailure.mockClear();
    addImageAsset.mockReset();
    addImageAsset.mockResolvedValue({
      id: 'img_1',
      path: '/stored/image.jpg',
      url: 'https://storage.example/image.jpg',
      localPath: '/tmp/image.jpg',
    });
    runTemplateLaunch.mockReset();
    loadTemplateLaunchSnapshotIfExists.mockReset();
    generateMetadata.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('passes user prompt to launcher when custom template disables script guidance', async () => {
    const projectId = 'project-custom';
    const prompt = 'Tell a comic story about brave space explorers';
    const languages = ['en', 'es'];
    const launcherDir = path.join(tmpRoot, 'launcher');
    await fs.mkdir(launcherDir, { recursive: true });
    const enScriptPath = path.join(launcherDir, 'en.txt');
    const esScriptPath = path.join(launcherDir, 'es.txt');
    await fs.writeFile(enScriptPath, 'English comic script', 'utf8');
    await fs.writeFile(esScriptPath, 'Spanish comic script', 'utf8');
    const imagePath = path.join(launcherDir, 'shot.jpg');
    await fs.writeFile(imagePath, 'image-bytes', 'utf8');

    runTemplateLaunch.mockResolvedValue({
      snapshot: {
        textScript: { en: enScriptPath, es: esScriptPath },
        images: [imagePath],
      },
      resultPath: path.join(launcherDir, 'result.json'),
      logPath: path.join(launcherDir, 'log.txt'),
      displayCommand: 'npm run template:launch',
    });
    loadTemplateLaunchSnapshotIfExists.mockResolvedValue(null);
    generateMetadata.mockImplementation(async ({ workspaceRoot, logDir }) => {
      await fs.mkdir(path.join(workspaceRoot, 'metadata'), { recursive: true });
      await fs.mkdir(logDir, { recursive: true });
      const outputPath = path.join(workspaceRoot, 'metadata', 'transcript-blocks.json');
      await fs.writeFile(outputPath, JSON.stringify({ blocks: [{ id: 'block-1', text: 'Line', start: 0, end: 750 }] }), 'utf8');
      return { outputPath, logPath: path.join(logDir, 'metadata.log'), command: 'npm run transcript:json' };
    });

    const cfg: any = {
      autoApproveScript: false,
      autoApproveAudio: false,
      includeDefaultMusic: true,
      addOverlay: true,
      useExactTextAsScript: false,
      durationSeconds: 30,
      targetLanguage: 'en',
      languages,
      watermarkEnabled: true,
      captionsEnabled: true,
      scriptCreationGuidanceEnabled: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: false,
      audioStyleGuidance: '',
      characterSelection: null,
      template: {
        id: 'tpl_v2_comics',
        code: 'v2-comics',
        customData: {
          type: 'custom',
          raw: {},
          customId: 'comics',
          supportsCustomCharacters: false,
          supportsExactText: false,
          supportsScriptPrompt: false,
        },
      },
    };

    await handleScriptPhase({
      projectId,
      cfg,
      jobPayload: { prompt, languages },
      creationGuidance: 'Add dramatic lighting',
      avoidanceGuidance: 'Avoid gore',
    });

    expect(runTemplateLaunch).toHaveBeenCalledTimes(1);
    const launchArgs = runTemplateLaunch.mock.calls[0][0];
    expect(launchArgs.userPrompt).toBe(prompt);
    expect(launchArgs.userTextPath).toBeNull();
    expect(upsertScript).toHaveBeenCalledTimes(languages.length);
    expect(markLanguageFailure).not.toHaveBeenCalled();

    const finalStatusCall = setStatus.mock.calls.at(-1);
    expect(finalStatusCall).toBeDefined();
    if (!finalStatusCall) return;
    expect(finalStatusCall[0]).toBe(projectId);
    expect(finalStatusCall[2]).toBe('Custom template script auto-approved');
    const statusPayload = finalStatusCall[3] as any;
    expect(statusPayload.templateFeatureWarnings).toContain('Script creation guidance is ignored for this custom template.');
    expect(statusPayload.templateFeatureWarnings).toContain('Script auto-approval is always enabled for this custom template.');
    expect(statusPayload.templateFeatureWarnings).toContain('Audio auto-approval is always enabled for this custom template.');
    expect(statusPayload.templateUserInputMode).toBe('user-prompt');
    expect(statusPayload.templateUserTextPath).toBeNull();
    expect(statusPayload.templateImageAssets).toEqual([
      {
        id: 'img_1',
        path: '/stored/image.jpg',
        url: 'https://storage.example/image.jpg',
        image: '001.jpg',
      },
    ]);
    expect(statusPayload.templateImageMetadata).toEqual([]);
  });

  it('saves user text to disk and runs custom template in text mode', async () => {
    const projectId = 'project-user-text';
    const userScript = 'This is the exact script the user supplied.';
    const languages = ['en'];
    const launcherDir = path.join(tmpRoot, 'launcher-text');
    await fs.mkdir(launcherDir, { recursive: true });
    const enScriptPath = path.join(launcherDir, 'en.txt');
    await fs.writeFile(enScriptPath, 'English script', 'utf8');
    const imagePath = path.join(launcherDir, 'shot.jpg');
    await fs.writeFile(imagePath, 'image-bytes', 'utf8');

    runTemplateLaunch.mockResolvedValue({
      snapshot: {
        textScript: { en: enScriptPath },
        images: [imagePath],
        imageMetadata: [
          {
            image: '001.jpg',
            model: 'runware:108@1',
            prompt: 'Make it moody',
            sentence: 'Line 1',
            size: '768x1344',
            raw: { image: '001.jpg', model: 'runware:108@1', prompt: 'Make it moody', sentence: 'Line 1', size: '768x1344' },
          },
        ],
      },
      resultPath: path.join(launcherDir, 'result.json'),
      logPath: path.join(launcherDir, 'log.txt'),
      displayCommand: 'npm run template:launch',
    });
    loadTemplateLaunchSnapshotIfExists.mockResolvedValue(null);
    generateMetadata.mockImplementation(async ({ workspaceRoot, logDir }) => {
      await fs.mkdir(path.join(workspaceRoot, 'metadata'), { recursive: true });
      await fs.mkdir(logDir, { recursive: true });
      const outputPath = path.join(workspaceRoot, 'metadata', 'transcript-blocks.json');
      await fs.writeFile(outputPath, JSON.stringify({ blocks: [{ id: 'block-1', text: 'Line', start: 0, end: 750 }] }), 'utf8');
      return { outputPath, logPath: path.join(logDir, 'metadata.log'), command: 'npm run transcript:json' };
    });

    const cfg: any = {
      autoApproveScript: true,
      autoApproveAudio: true,
      includeDefaultMusic: true,
      addOverlay: true,
      useExactTextAsScript: false,
      durationSeconds: 30,
      targetLanguage: 'en',
      languages,
      watermarkEnabled: true,
      captionsEnabled: true,
      scriptCreationGuidanceEnabled: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: false,
      audioStyleGuidance: '',
      characterSelection: null,
      template: {
        id: 'tpl_v2_text_mode',
        code: 'v2-text-mode',
        customData: {
          type: 'custom',
          raw: {},
          customId: 'text-mode',
          supportsCustomCharacters: false,
          supportsExactText: true,
          supportsScriptPrompt: true,
        },
      },
    };

    await handleScriptPhase({
      projectId,
      cfg,
      jobPayload: { prompt: 'ignored prompt', rawScript: userScript, useExactTextAsScript: true },
      creationGuidance: '',
      avoidanceGuidance: '',
    });

    expect(runTemplateLaunch).toHaveBeenCalledTimes(1);
    const launchArgs = runTemplateLaunch.mock.calls[0][0];
    expect(launchArgs.userPrompt).toBeNull();
    expect(typeof launchArgs.userTextPath).toBe('string');
    const savedText = await fs.readFile(launchArgs.userTextPath!, 'utf8');
    expect(savedText).toBe(userScript);

    const finalStatusCall = setStatus.mock.calls.at(-1);
    expect(finalStatusCall).toBeDefined();
    if (!finalStatusCall) return;
    const statusPayload = finalStatusCall[3] as any;
    expect(statusPayload.templateUserInputMode).toBe('user-text');
    expect(statusPayload.templateUserTextPath).toBe(launchArgs.userTextPath);
    expect(statusPayload.templateLaunchCached).toBe(false);
    expect(statusPayload.templateImageAssets).toEqual([
      {
        id: 'img_1',
        path: '/stored/image.jpg',
        url: 'https://storage.example/image.jpg',
        image: '001.jpg',
      },
    ]);
    expect(statusPayload.templateImageMetadata).toEqual([
      {
        image: '001.jpg',
        model: 'runware:108@1',
        prompt: 'Make it moody',
        sentence: 'Line 1',
        size: '768x1344',
        url: 'https://storage.example/image.jpg',
        path: '/stored/image.jpg',
        assetId: 'img_1',
      },
    ]);
  });

  it('allows user text mode even when template does not advertise support', async () => {
    const projectId = 'project-user-text-unsupported';
    const userScript = 'Exact text even though template claims not to support it.';
    const launcherDir = path.join(tmpRoot, 'launcher-text-unsupported');
    await fs.mkdir(launcherDir, { recursive: true });
    const enScriptPath = path.join(launcherDir, 'en.txt');
    await fs.writeFile(enScriptPath, 'English script', 'utf8');
    const imagePath = path.join(launcherDir, 'shot.jpg');
    await fs.writeFile(imagePath, 'image-bytes', 'utf8');

    runTemplateLaunch.mockResolvedValue({
      snapshot: {
        textScript: { en: enScriptPath },
        images: [imagePath],
      },
      resultPath: path.join(launcherDir, 'result.json'),
      logPath: path.join(launcherDir, 'log.txt'),
      displayCommand: 'npm run template:launch',
    });
    loadTemplateLaunchSnapshotIfExists.mockResolvedValue(null);
    generateMetadata.mockImplementation(async ({ workspaceRoot, logDir }) => {
      await fs.mkdir(path.join(workspaceRoot, 'metadata'), { recursive: true });
      await fs.mkdir(logDir, { recursive: true });
      const outputPath = path.join(workspaceRoot, 'metadata', 'transcript-blocks.json');
      await fs.writeFile(outputPath, JSON.stringify({ blocks: [{ id: 'block-1', text: 'Line', start: 0, end: 750 }] }), 'utf8');
      return { outputPath, logPath: path.join(logDir, 'metadata.log'), command: 'npm run transcript:json' };
    });

    const cfg: any = {
      autoApproveScript: true,
      autoApproveAudio: true,
      includeDefaultMusic: true,
      addOverlay: true,
      useExactTextAsScript: true,
      durationSeconds: 30,
      targetLanguage: 'en',
      languages: ['en'],
      watermarkEnabled: true,
      captionsEnabled: true,
      scriptCreationGuidanceEnabled: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: false,
      audioStyleGuidance: '',
      characterSelection: null,
      template: {
        id: 'tpl_v2_custom_unsupported',
        code: 'v2-custom-unsupported',
        customData: {
          type: 'custom',
          raw: {},
          customId: 'custom-unsupported',
          supportsCustomCharacters: false,
          supportsExactText: false,
          supportsScriptPrompt: true,
        },
      },
    };

    await handleScriptPhase({
      projectId,
      cfg,
      jobPayload: { prompt: 'ignored prompt', rawScript: userScript, useExactTextAsScript: true },
      creationGuidance: '',
      avoidanceGuidance: '',
    });

    expect(runTemplateLaunch).toHaveBeenCalledTimes(1);
    const launchArgs = runTemplateLaunch.mock.calls[0][0];
    expect(launchArgs.userPrompt).toBeNull();
    expect(typeof launchArgs.userTextPath).toBe('string');

    const finalStatusCall = setStatus.mock.calls.at(-1);
    expect(finalStatusCall).toBeDefined();
    if (!finalStatusCall) return;
    const statusPayload = finalStatusCall[3] as any;
    expect(statusPayload.templateUserInputMode).toBe('user-text');
    expect(statusPayload.templateFeatureWarnings).toContain('Exact script mode was requested but is not supported for this custom template.');
  });
});
