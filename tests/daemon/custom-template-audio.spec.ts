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
const updateLanguageProgress = vi.fn();
const addAudioCandidate = vi.fn();
const getLanguageProgress = vi.fn();
const getScriptText = vi.fn();
const markLanguageFailure = vi.fn();
const createJob = vi.fn();
const generateVoiceovers = vi.fn();

describe('custom template audio auto-approval', () => {
  let tmpRoot: string;
  let envPath: string;
  let handleAudioPhase: typeof import('../../scripts/daemon/helpers/executor/audio-phase').handleAudioPhase;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-custom-audio-'));
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
    vi.doMock('../../scripts/daemon/helpers/db', () => ({
      addAudioCandidate,
      createJob,
      getLanguageProgress,
      getScriptText,
      markLanguageFailure,
      setStatus,
      updateLanguageProgress,
    }));
    vi.doMock('../../scripts/daemon/helpers/prompt-to-wav', () => ({
      generateVoiceovers,
    }));
    const configModule = await import('../../scripts/daemon/helpers/config');
    configModule.__resetDaemonConfigForTests();
    const config = configModule.loadConfig();
    const contextModule = await import('../../scripts/daemon/helpers/executor/context');
    contextModule.__setDaemonConfigForTests(config);
    ({ handleAudioPhase } = await import('../../scripts/daemon/helpers/executor/audio-phase'));

    setStatus.mockClear();
    updateLanguageProgress.mockClear();
    addAudioCandidate.mockReset();
    getLanguageProgress.mockReset();
    getScriptText.mockReset();
    markLanguageFailure.mockReset();
    createJob.mockReset();
    generateVoiceovers.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    vi.resetModules();
  });

  it('auto-approves audio even when autoApproveAudio is disabled for custom templates', async () => {
    const projectId = 'project-audio-custom';
    getLanguageProgress.mockResolvedValue({
      progress: [
        { languageCode: 'en', disabled: false },
      ],
    });
    getScriptText.mockResolvedValue('Script body');
    const outputPath = path.join(tmpRoot, 'voice.wav');
    await fs.writeFile(outputPath, 'audio-bytes');
    generateVoiceovers.mockResolvedValue({
      runDirectory: path.join(tmpRoot, 'voice-run'),
      outputs: [{ path: outputPath, url: outputPath, localPath: outputPath }],
      error: null,
    });
    addAudioCandidate.mockResolvedValue({
      id: 'audio-en',
      path: outputPath,
      url: 'https://cdn/audio-en',
      localPath: outputPath,
    });

    const cfg: any = {
      targetLanguage: 'en',
      languages: ['en'],
      autoApproveAudio: false,
      voiceAssignments: {
        en: {
          voiceId: 'english-primary-voice',
          templateVoiceId: 'tpl-voice-en-fast',
          title: 'English Fast Female',
          speed: 'fast',
          gender: 'female',
          voiceProvider: 'minimax',
          source: 'project',
        },
      },
      voiceProviders: {
        'english-primary-voice': 'minimax',
      },
      template: {
        id: 'tpl-custom',
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

    await handleAudioPhase({ projectId, cfg, jobPayload: {} });

    expect(setStatus).toHaveBeenCalledWith(
      projectId,
      expect.anything(),
      'Transcribing voiceovers',
      expect.objectContaining({ audioLanguage: 'en' }),
    );
    expect(createJob).not.toHaveBeenCalled();
  });

  it('only forwards audio style prompts to providers that support them', async () => {
    getLanguageProgress.mockResolvedValue({
      progress: [
        { languageCode: 'en', disabled: false },
      ],
    });
    getScriptText.mockResolvedValue('Script body');
    const outputPath = path.join(tmpRoot, 'voice.wav');
    generateVoiceovers.mockResolvedValue({
      runDirectory: path.join(tmpRoot, 'voice-run'),
      outputs: [{ path: outputPath, take: 1 }],
      error: null,
    });
    addAudioCandidate.mockResolvedValue({
      id: 'audio-en',
      path: outputPath,
      url: 'https://cdn/audio-en',
      localPath: outputPath,
    });

    const baseCfg: any = {
      userId: 'user-1',
      autoApproveScript: true,
      autoApproveAudio: true,
      includeDefaultMusic: true,
      addOverlay: true,
      includeCallToAction: true,
      watermarkEnabled: false,
      captionsEnabled: false,
      useExactTextAsScript: false,
      durationSeconds: 30,
      targetLanguage: 'en',
      languages: ['en'],
      scriptCreationGuidanceEnabled: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: true,
      audioStyleGuidance: 'Smoky tone please',
      template: null,
      characterSelection: null,
    };

    const buildCfg = (provider: 'minimax' | 'inworld' | 'elevenlabs') => {
      const voiceId = `${provider}-voice`;
      return {
        ...baseCfg,
        voiceId,
        voiceAssignments: {
          en: {
            voiceId,
            templateVoiceId: 'tpl-voice-en-fast',
            title: 'English Voice',
            speed: 'fast',
            gender: 'female',
            voiceProvider: provider,
            source: 'project',
          },
        },
        voiceProviders: {
          [voiceId]: provider,
        },
      };
    };

    const runCase = async (provider: 'minimax' | 'inworld' | 'elevenlabs', expectedStyle: string | null) => {
      generateVoiceovers.mockClear();
      addAudioCandidate.mockClear();
      await handleAudioPhase({ projectId: `project-${provider}`, cfg: buildCfg(provider), jobPayload: {} });
      expect(generateVoiceovers).toHaveBeenCalledTimes(1);
      expect(generateVoiceovers).toHaveBeenCalledWith(
        expect.objectContaining({
          voiceProvider: provider,
          style: expectedStyle,
        }),
      );
    };

    await runCase('minimax', null);
    await runCase('inworld', null);
    await runCase('elevenlabs', 'Smoky tone please');
  });
});
