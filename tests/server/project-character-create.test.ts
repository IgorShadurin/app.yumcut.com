import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ProjectStatus } from '@/shared/constants/status';

const prismaMock = vi.hoisted(() => ({
  character: { findFirst: vi.fn() },
  userCharacterVariation: { findFirst: vi.fn() },
  template: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  userSettings: { findUnique: vi.fn() },
  project: { create: vi.fn(), update: vi.fn() },
  projectLanguageProgress: { upsert: vi.fn() },
  projectCharacterSelection: { create: vi.fn() },
  projectStatusHistory: { create: vi.fn() },
  job: { create: vi.fn() },
  $transaction: vi.fn(),
}));

const authenticateApiRequestMock = vi.hoisted(() => vi.fn());
const getProjectCreationSettingsMock = vi.hoisted(() => vi.fn());
const getAdminVoiceProviderSettingsMock = vi.hoisted(() => vi.fn());
const listPublicVoicesMock = vi.hoisted(() => vi.fn());
const resolveVoiceInfoMock = vi.hoisted(() => vi.fn());
const spendTokensMock = vi.hoisted(() => vi.fn());
const validateProjectStateMock = vi.hoisted(() => vi.fn());
const notifyAdminsOfNewProjectMock = vi.hoisted(() => vi.fn());
const sendProjectCreatedEmailMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/db', () => ({ prisma: prismaMock }));
vi.mock('@/server/api-user', () => ({ authenticateApiRequest: authenticateApiRequestMock }));
vi.mock('@/server/admin/project-creation', () => ({ getProjectCreationSettings: getProjectCreationSettingsMock }));
vi.mock('@/server/admin/voice-providers', () => ({ getAdminVoiceProviderSettings: getAdminVoiceProviderSettingsMock }));
vi.mock('@/server/voices', () => ({
  listPublicVoices: listPublicVoicesMock,
  resolveVoiceInfo: resolveVoiceInfoMock,
}));
vi.mock('@/server/tokens', () => ({
  spendTokens: spendTokensMock,
  makeUserInitiator: vi.fn((userId: string) => `user:${userId}`),
  TOKEN_TRANSACTION_TYPES: { projectCreation: 'projectCreation', imageGeneration: 'imageGeneration' },
}));
vi.mock('@/shared/projects', () => ({ validateProjectState: validateProjectStateMock }));
vi.mock('@/server/telegram', () => ({ notifyAdminsOfNewProject: notifyAdminsOfNewProjectMock }));
vi.mock('@/server/emails/project-lifecycle', () => ({ sendProjectCreatedEmail: sendProjectCreatedEmailMock }));

describe('project creation from character slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    authenticateApiRequestMock.mockResolvedValue({
      userId: 'user-1',
      source: 'session',
      sessionUser: { id: 'user-1', email: 'test@example.com', name: 'User One', preferredLanguage: 'en', isAdmin: false },
    });
    getProjectCreationSettingsMock.mockResolvedValue({ enabled: true, disabledReason: null });
    getAdminVoiceProviderSettingsMock.mockResolvedValue({ enabledProviders: ['elevenlabs'] });
    listPublicVoicesMock.mockResolvedValue([]);
    validateProjectStateMock.mockReturnValue({ issues: [] });
    spendTokensMock.mockResolvedValue(undefined);
    notifyAdminsOfNewProjectMock.mockResolvedValue(undefined);
    sendProjectCreatedEmailMock.mockResolvedValue(undefined);

    prismaMock.user.findUnique.mockResolvedValue({
      name: 'User One',
      email: 'test@example.com',
      preferredLanguage: 'en',
      isAdmin: false,
      settings: { projectEmailsEnabled: true },
    });
    prismaMock.userSettings.findUnique.mockResolvedValue({
      includeDefaultMusic: true,
      addOverlay: true,
      includeCallToAction: true,
      autoApproveScript: true,
      autoApproveAudio: true,
      watermarkEnabled: true,
      captionsEnabled: true,
      targetLanguages: ['en', 'es'],
      languageVoicePreferences: {},
      preferredVoiceId: 'voice-preferred',
      projectEmailsEnabled: true,
    });
    prismaMock.project.create.mockResolvedValue({
      id: 'project-1',
      title: 'Character project',
      status: ProjectStatus.New,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    prismaMock.projectLanguageProgress.upsert.mockResolvedValue(undefined);
    prismaMock.projectCharacterSelection.create.mockResolvedValue(undefined);
    prismaMock.projectStatusHistory.create.mockResolvedValue(undefined);
    prismaMock.job.create.mockResolvedValue(undefined);
    prismaMock.project.update.mockResolvedValue(undefined);
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback({
      project: prismaMock.project,
      projectLanguageProgress: prismaMock.projectLanguageProgress,
      projectCharacterSelection: prismaMock.projectCharacterSelection,
      projectStatusHistory: prismaMock.projectStatusHistory,
      job: prismaMock.job,
    }));
  });

  it('creates a character project by slug and persists resolved selection + character voice', async () => {
    prismaMock.character.findFirst.mockResolvedValue({
      id: 'char-1',
      defaultVoiceId: 'voice-char',
      variations: [{ id: 'var-1' }],
    });
    resolveVoiceInfoMock.mockImplementation(async (input: string) => {
      if (input === 'voice-char') return { externalId: 'voice-char', voiceProvider: 'elevenlabs' };
      if (input === 'voice-preferred') return { externalId: 'voice-preferred', voiceProvider: 'elevenlabs' };
      return null;
    });

    const route = await import('@/app/api/projects/route');
    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Tell a short story',
        durationSeconds: 30,
        characterSlug: 'ada-mentor',
        projectExperience: 'character',
        contentTone: 'playful',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await route.POST(req);
    expect(res.status).toBe(200);
    expect(prismaMock.character.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { slug: 'ada-mentor', isCatalogPublic: true },
    }));
    expect(prismaMock.projectCharacterSelection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        characterId: 'char-1',
        characterVariationId: 'var-1',
      }),
    }));
    expect(prismaMock.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        voiceId: 'voice-char',
        voiceProvider: 'elevenlabs',
      }),
    }));
    expect(prismaMock.project.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        contentTone: 'playful',
      }),
    }));
    expect(prismaMock.job.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          durationSeconds: 20,
          projectExperience: 'character',
          characterVideoQuality: 'high',
          characterSlug: 'ada-mentor',
          contentTone: 'playful',
          includeDefaultMusic: false,
          addOverlay: false,
          watermarkEnabled: false,
          captionsEnabled: true,
          includeCallToAction: true,
          autoApproveScript: true,
          autoApproveAudio: true,
          scriptCreationGuidanceEnabled: false,
          scriptCreationGuidance: '',
          scriptAvoidanceGuidanceEnabled: false,
          scriptAvoidanceGuidance: '',
          audioStyleGuidanceEnabled: false,
          audioStyleGuidance: '',
          videoGeneration: expect.objectContaining({
            mode: 'lipsync_runware',
            lipsyncPrompt: expect.any(String),
          }),
        }),
      }),
    }));
  });

  it('enables NSFW blocking for mobile image generation projects', async () => {
    authenticateApiRequestMock.mockResolvedValue({
      userId: 'user-1',
      source: 'mobile',
    });
    prismaMock.project.create.mockResolvedValue({
      id: 'project-image-1',
      title: 'Image project',
      status: ProjectStatus.ProcessImagesGeneration,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const route = await import('@/app/api/projects/route');
    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Create an image',
        projectExperience: 'image-generation',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await route.POST(req);
    expect(res.status).toBe(200);
    expect(spendTokensMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        checkNSFW: true,
        safetyNegativePrompt: expect.stringContaining('nudity'),
      }),
    }), expect.anything());
    expect(prismaMock.job.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          projectExperience: 'image-generation',
          checkNSFW: true,
          safetyNegativePrompt: expect.stringContaining('nudity'),
          prompt: expect.stringContaining('Mobile safety instruction:'),
          userPrompt: 'Create an image',
        }),
      }),
    }));
    expect(sendProjectCreatedEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      email: 'test@example.com',
      projectId: 'project-image-1',
      projectEmailsEnabled: true,
    }));
  });

  it('rejects explicit NSFW image prompts from mobile before charging tokens', async () => {
    authenticateApiRequestMock.mockResolvedValue({
      userId: 'user-1',
      source: 'mobile',
    });

    const route = await import('@/app/api/projects/route');
    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Generate a naked person',
        projectExperience: 'image-generation',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await route.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.message).toBe('This prompt cannot be generated from the iOS app.');
    expect(spendTokensMock).not.toHaveBeenCalled();
    expect(prismaMock.project.create).not.toHaveBeenCalled();
    expect(prismaMock.job.create).not.toHaveBeenCalled();
  });

  it('charges low-quality character projects at the low-quality fixed cost', async () => {
    prismaMock.character.findFirst.mockResolvedValue({
      id: 'char-1',
      defaultVoiceId: null,
      variations: [{ id: 'var-1' }],
    });
    resolveVoiceInfoMock.mockResolvedValue(null);

    const route = await import('@/app/api/projects/route');
    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Tell a short story',
        durationSeconds: 30,
        characterSlug: 'ada-mentor',
        projectExperience: 'character',
        characterVideoQuality: 'low',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await route.POST(req);
    expect(res.status).toBe(200);
    expect(spendTokensMock).toHaveBeenCalledWith(expect.objectContaining({
      amount: 10,
      description: 'Project creation (character low quality)',
      metadata: expect.objectContaining({
        characterVideoQuality: 'low',
        videoGenerationMode: 'lipsync_runpod',
      }),
    }), expect.anything());
    expect(prismaMock.job.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          characterVideoQuality: 'low',
          videoGeneration: expect.objectContaining({
            mode: 'lipsync_runpod',
          }),
        }),
      }),
    }));
  });

  it('creates character project in exact mode and sends raw script into the script job', async () => {
    prismaMock.character.findFirst.mockResolvedValue({
      id: 'char-1',
      defaultVoiceId: null,
      variations: [{ id: 'var-1' }],
    });
    resolveVoiceInfoMock.mockResolvedValue(null);

    const route = await import('@/app/api/projects/route');
    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        rawScript: 'Exact character line',
        useExactTextAsScript: true,
        characterSlug: 'ada-mentor',
        projectExperience: 'character',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await route.POST(req);
    expect(res.status).toBe(200);
    expect(validateProjectStateMock).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'script',
      text: 'Exact character line',
    }));
    expect(prismaMock.project.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        prompt: null,
        rawScript: 'Exact character line',
      }),
    }));
    expect(prismaMock.job.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          prompt: null,
          rawScript: 'Exact character line',
          useExactTextAsScript: true,
          durationSeconds: 20,
          projectExperience: 'character',
        }),
      }),
    }));
  });

  it('falls back to preferred voice when character default voice is not resolvable', async () => {
    prismaMock.character.findFirst.mockResolvedValue({
      id: 'char-1',
      defaultVoiceId: 'voice-char-missing',
      variations: [{ id: 'var-1' }],
    });
    resolveVoiceInfoMock.mockImplementation(async (input: string) => {
      if (input === 'voice-char-missing') return null;
      if (input === 'voice-preferred') return { externalId: 'voice-preferred', voiceProvider: 'elevenlabs' };
      return null;
    });

    const route = await import('@/app/api/projects/route');
    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Tell a short story',
        durationSeconds: 30,
        characterSlug: 'ada-mentor',
        projectExperience: 'character',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await route.POST(req);
    expect(res.status).toBe(200);
    expect(prismaMock.project.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        contentTone: 'neutral',
      }),
    }));
    expect(prismaMock.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        voiceId: 'voice-preferred',
        voiceProvider: 'elevenlabs',
      }),
    }));
  });

  it('keeps auto-approve enabled for character projects even when old global settings are disabled', async () => {
    prismaMock.character.findFirst.mockResolvedValue({
      id: 'char-1',
      defaultVoiceId: null,
      variations: [{ id: 'var-1' }],
    });
    prismaMock.userSettings.findUnique.mockResolvedValue({
      includeDefaultMusic: true,
      addOverlay: true,
      includeCallToAction: false,
      autoApproveScript: false,
      autoApproveAudio: false,
      watermarkEnabled: true,
      captionsEnabled: true,
      targetLanguages: ['en'],
      languageVoicePreferences: {},
      preferredVoiceId: null,
      projectEmailsEnabled: true,
      scriptCreationGuidanceEnabled: true,
      scriptCreationGuidance: 'old guidance',
      scriptAvoidanceGuidanceEnabled: true,
      scriptAvoidanceGuidance: 'old avoidance',
      audioStyleGuidanceEnabled: true,
      audioStyleGuidance: 'old audio guidance',
    });
    resolveVoiceInfoMock.mockResolvedValue(null);

    const route = await import('@/app/api/projects/route');
    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Angry short story',
        durationSeconds: 30,
        characterSlug: 'ada-mentor',
        projectExperience: 'character',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await route.POST(req);
    expect(res.status).toBe(200);
    expect(prismaMock.job.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          autoApproveScript: true,
          autoApproveAudio: true,
          scriptCreationGuidanceEnabled: false,
          scriptCreationGuidance: '',
          scriptAvoidanceGuidanceEnabled: false,
          scriptAvoidanceGuidance: '',
          audioStyleGuidanceEnabled: false,
          audioStyleGuidance: '',
        }),
      }),
    }));
  });
});
