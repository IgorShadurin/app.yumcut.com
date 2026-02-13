import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

const setStatus = vi.fn(async () => {});
const uploadCharacterImage = vi.fn(async () => ({ path: 'characters/generated.png', url: 'https://example.com/generated.png' }));
const registerGeneratedCharacter = vi.fn(async () => {});
const resolveCharacterImagePath = vi.fn(async () => '/tmp/static-character.png');
const updateLanguageProgress = vi.fn(async () => ({}));
const getLanguageProgress = vi.fn(async () => ({
  progress: [],
  aggregate: {
    transcription: { done: true, remaining: [] },
    captions: { done: true, remaining: [] },
    videoParts: { done: true, remaining: [] },
    finalVideo: { done: true, remaining: [] },
  },
}));

vi.mock('../../scripts/daemon/helpers/db', () => ({
  getCreationSnapshot: vi.fn(),
  setStatus,
  uploadCharacterImage,
  registerGeneratedCharacter,
  addAudioCandidate: vi.fn(),
  getScriptText: vi.fn(),
  upsertScript: vi.fn(),
  getTranscriptionSnapshot: vi.fn(),
  setFinalVideo: vi.fn(),
  getLanguageProgress,
  updateLanguageProgress,
}));

vi.mock('../../scripts/daemon/helpers/character-cache', () => ({
  resolveCharacterImagePath,
}));

const generateImagesMock = vi.fn(async () => ({ logPath: '/tmp/log.txt', command: 'npm run' }));

vi.mock('../../scripts/daemon/helpers/images', () => ({
  generateImages: generateImagesMock,
}));

describe('executeForProject images phase', () => {
  let tmpRoot: string;
  let envPath: string;
  let executeForProject: typeof import('../../scripts/daemon/helpers/executor').executeForProject;
  let getCreationSnapshot: ReturnType<typeof vi.fn>;
  let ProjectStatus: typeof import('@/shared/constants/status').ProjectStatus;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-executor-'));
    envPath = path.join(tmpRoot, 'daemon.env');
    const scriptWorkspace = path.resolve('tests/daemon/dummy-scripts/DAEMON_SCRIPT_WORKSPACE');
    const scriptWorkspaceV2 = path.resolve('tests/daemon/dummy-scripts/DAEMON_SCRIPT_WORKSPACE_V2');
    const captionWorkspace = path.resolve('tests/daemon/dummy-scripts/DAEMON_SCRIPT_CAPTION');
    const envContent = [
      'DAEMON_ID=daemon-images-test',
      'DAEMON_API_BASE_URL=http://127.0.0.1:4000',
      'DAEMON_STORAGE_BASE_URL=http://127.0.0.1:5000',
      'DAEMON_API_PASSWORD=secret',
      'DAEMON_INTERVAL_MS=1000',
      'DAEMON_MAX_CONCURRENCY=1',
      'DAEMON_TASK_TIMEOUT_SECONDS=60',
      'DAEMON_REQUEST_TIMEOUT_MS=1000',
      'DAEMON_HEALTH_PATH=/api/daemon/health',
      'DAEMON_STORAGE_HEALTH_PATH=/api/storage/health',
      `DAEMON_SCRIPT_WORKSPACE=${scriptWorkspace}`,
      `DAEMON_SCRIPT_WORKSPACE_V2=${scriptWorkspaceV2}`,
      `DAEMON_SCRIPT_CAPTION=${captionWorkspace}`,
      `DAEMON_PROJECTS_WORKSPACE=${tmpRoot}`,
      'DAEMON_AUDIO_DEFAULT_VOICE=Kore',
      'DAEMON_SCRIPT_MODE=fast',
    ].join('\n');
    await fs.writeFile(envPath, envContent, 'utf8');
    process.env.DAEMON_ENV_FILE = envPath;
    vi.resetModules();
    ({ ProjectStatus } = await import('@/shared/constants/status'));
    const dbModule = await import('../../scripts/daemon/helpers/db');
    getCreationSnapshot = dbModule.getCreationSnapshot as ReturnType<typeof vi.fn>;
    ({
      executeForProject,
    } = await import('../../scripts/daemon/helpers/executor'));
    getCreationSnapshot.mockReset();
    setStatus.mockClear();
    uploadCharacterImage.mockClear();
    registerGeneratedCharacter.mockClear();
    resolveCharacterImagePath.mockClear();
    generateImagesMock.mockClear();
    updateLanguageProgress.mockClear();
    getLanguageProgress.mockClear();
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('passes newCharacter flag and registers generated character when dynamic selection is requested', async () => {
    // Prepare unique-character placeholder
    const projectId = 'project_dynamic';
    const workspace = path.join(tmpRoot, projectId, 'workspace', 'qwen-image-edit');
    await fs.mkdir(workspace, { recursive: true });
    const uniqueCharacterPath = path.join(workspace, 'unique-character.jpg');
    await fs.writeFile(uniqueCharacterPath, 'dynamic image', 'utf8');

    getCreationSnapshot.mockResolvedValue({
      autoApproveScript: true,
      autoApproveAudio: true,
      includeDefaultMusic: true,
      addOverlay: true,
      includeCallToAction: true,
      useExactTextAsScript: false,
      durationSeconds: 30,
      targetLanguage: 'en',
      watermarkEnabled: true,
      captionsEnabled: false,
      scriptCreationGuidanceEnabled: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: false,
      audioStyleGuidance: '',
      characterSelection: {
        source: 'dynamic',
        status: 'processing',
        imageUrl: null,
      },
      template: null,
    });

    await executeForProject(projectId, ProjectStatus.ProcessImagesGeneration, {
      characterSelection: { source: 'dynamic' },
    });

    expect(generateImagesMock).toHaveBeenCalledTimes(1);
    const firstCall = generateImagesMock.mock.calls[0] as any;
    expect(firstCall).toBeDefined();
    const args = firstCall[0] as any;
    expect(args.newCharacter).toBe(true);
    expect(args.workspaceRoot).toBe(path.join(tmpRoot, projectId, 'workspace'));
    expect(uploadCharacterImage).toHaveBeenCalledWith(projectId, uniqueCharacterPath);
    expect(registerGeneratedCharacter).toHaveBeenCalledWith(projectId, {
      path: 'characters/generated.png',
      url: 'https://example.com/generated.png',
    });
  });

  it('uses existing character image when provided and does not auto-register new character', async () => {
    const projectId = 'project_static';
    getCreationSnapshot.mockResolvedValue({
      autoApproveScript: true,
      autoApproveAudio: true,
      includeDefaultMusic: true,
      addOverlay: true,
      includeCallToAction: true,
      useExactTextAsScript: false,
      durationSeconds: 30,
      targetLanguage: 'en',
      watermarkEnabled: true,
      captionsEnabled: false,
      scriptCreationGuidanceEnabled: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: false,
      audioStyleGuidance: '',
      characterSelection: {
        type: 'user',
        userCharacterId: 'user-char',
        variationId: 'user-var',
        imageUrl: 'https://example.com/character.png',
        status: 'ready',
      },
      template: null,
    });
    resolveCharacterImagePath.mockResolvedValue('/tmp/user-character.png');

    await executeForProject(projectId, ProjectStatus.ProcessImagesGeneration, {});

    expect(generateImagesMock).toHaveBeenCalledTimes(1);
    const staticCall = generateImagesMock.mock.calls[0] as any;
    expect(staticCall).toBeDefined();
    const args = staticCall[0] as any;
    expect(args.newCharacter).toBe(false);
    expect(args.workspaceRoot).toBe(path.join(tmpRoot, projectId, 'workspace'));
    expect(args.characterImagePath).toBe('/tmp/user-character.png');
    expect(registerGeneratedCharacter).not.toHaveBeenCalled();
  });
});
