import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';

const generateMetadataMock = vi.hoisted(() => vi.fn());
const ensureProjectScaffoldMock = vi.hoisted(() => vi.fn());
const ensureLanguageWorkspaceMock = vi.hoisted(() => vi.fn());
const ensureLanguageLogDirMock = vi.hoisted(() => vi.fn());
const getLanguageProgressMock = vi.hoisted(() => vi.fn());
const setStatusMock = vi.hoisted(() => vi.fn());
const updateLanguageProgressMock = vi.hoisted(() => vi.fn());

vi.mock('../../scripts/daemon/helpers/metadata', () => ({
  generateMetadata: generateMetadataMock,
}));

vi.mock('../../scripts/daemon/helpers/language-workspace', () => ({
  ensureProjectScaffold: ensureProjectScaffoldMock,
  ensureLanguageWorkspace: ensureLanguageWorkspaceMock,
  ensureLanguageLogDir: ensureLanguageLogDirMock,
}));

vi.mock('../../scripts/daemon/helpers/db', () => ({
  getLanguageProgress: getLanguageProgressMock,
  setStatus: setStatusMock,
  updateLanguageProgress: updateLanguageProgressMock,
}));

vi.mock('../../scripts/daemon/helpers/logger', () => {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  return {
    log: { info, warn, error },
  };
});

import { ProjectStatus } from '@/shared/constants/status';
import { handleMetadataPhase } from '../../scripts/daemon/helpers/executor/metadata-phase';

describe('metadata phase', () => {
  let baseDir: string;
  let projectRoot: string;
  let workspaceRoot: string;
  let logsRoot: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(tmpdir(), 'metadata-phase-'));
    projectRoot = path.join(baseDir, 'project');
    workspaceRoot = path.join(projectRoot, 'workspace');
    logsRoot = path.join(projectRoot, 'logs');
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.mkdir(logsRoot, { recursive: true });

    generateMetadataMock.mockReset();
    ensureProjectScaffoldMock.mockReset();
    ensureLanguageWorkspaceMock.mockReset();
    ensureLanguageLogDirMock.mockReset();
    getLanguageProgressMock.mockReset();
    setStatusMock.mockReset();
    updateLanguageProgressMock.mockReset();

    ensureProjectScaffoldMock.mockResolvedValue({
      projectRoot,
      workspaceRoot,
      logsRoot,
    });

    ensureLanguageWorkspaceMock.mockImplementation(async (_projectId: string, languageCode: string) => {
      const languageWorkspace = path.join(workspaceRoot, languageCode);
      const languageLogsRoot = path.join(logsRoot, languageCode);
      await fs.mkdir(languageWorkspace, { recursive: true });
      await fs.mkdir(languageLogsRoot, { recursive: true });
      return {
        projectRoot,
        workspaceRoot,
        logsRoot,
        languageCode,
        languageWorkspace,
        languageLogsRoot,
      };
    });

    ensureLanguageLogDirMock.mockImplementation(async (info: { languageLogsRoot: string }, kind: string) => {
      const dir = path.join(info.languageLogsRoot, kind);
      await fs.mkdir(dir, { recursive: true });
      return dir;
    });

    generateMetadataMock.mockImplementation(async ({ workspaceRoot: langWorkspace, logDir, targetBlockCount }: any) => {
      const language = path.basename(langWorkspace);
      const metadataDir = path.join(langWorkspace, 'metadata');
      await fs.mkdir(metadataDir, { recursive: true });
      await fs.mkdir(logDir, { recursive: true });
      const outputPath = path.join(metadataDir, 'transcript-blocks.json');
      const baseCount = language === 'en' ? 4 : 6;
      const blocksCount =
        typeof targetBlockCount === 'number' && targetBlockCount > 0 ? targetBlockCount : baseCount;
      const blocks = Array.from({ length: blocksCount }, (_unused, idx) => ({
        id: `b${idx + 1}`,
        text: `Block ${idx + 1}`,
        start: idx * 1000,
        end: idx * 1000 + 500,
      }));
      await fs.writeFile(outputPath, JSON.stringify({ blocks }), 'utf8');
      return {
        logPath: path.join(logDir, `metadata-${language}.log`),
        command: `mock-${language}`,
        outputPath,
      };
    });

    const progressStore = new Map<string, any>();
    (getLanguageProgressMock as any).__store = progressStore;
    const computeAggregate = (progress: any[]) => {
      const active = progress.filter((row) => !row.disabled);
      const remaining = (key: 'transcriptionDone' | 'captionsDone' | 'videoPartsDone' | 'finalVideoDone') =>
        active.filter((row) => !row[key]).map((row) => row.languageCode);
      const allDone = (key: 'transcriptionDone' | 'captionsDone' | 'videoPartsDone' | 'finalVideoDone') =>
        active.length > 0 && active.every((row) => row[key]);
      return {
        transcription: { done: allDone('transcriptionDone'), remaining: remaining('transcriptionDone') },
        captions: { done: allDone('captionsDone'), remaining: remaining('captionsDone') },
        videoParts: { done: allDone('videoPartsDone'), remaining: remaining('videoPartsDone') },
        finalVideo: { done: allDone('finalVideoDone'), remaining: remaining('finalVideoDone') },
      };
    };

    getLanguageProgressMock.mockImplementation(async () => {
      const progress = Array.from(progressStore.values());
      return {
        progress,
        aggregate: computeAggregate(progress),
      };
    });

    updateLanguageProgressMock.mockImplementation(async (payload: any) => {
      const { languageCode, ...rest } = payload;
      const existing = progressStore.get(languageCode) ?? {
        languageCode,
        transcriptionDone: false,
        captionsDone: false,
        videoPartsDone: false,
        finalVideoDone: false,
        disabled: false,
        failedStep: null,
        failureReason: null,
      };
      progressStore.set(languageCode, {
        ...existing,
        ...rest,
        languageCode,
        disabled: rest.disabled ?? existing.disabled,
        failedStep: rest.failedStep ?? existing.failedStep,
        failureReason: rest.failureReason ?? existing.failureReason,
      });
      return {};
    });

    setStatusMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    try {
      await fs.rm(baseDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('reuses the base block count for additional languages', async () => {
    const projectId = 'proj';
    const cfg = {
      targetLanguage: 'en',
      languages: ['en', 'es'],
      captionsEnabled: true,
    } as any;
    const daemonConfig = {
      scriptWorkspaceV2: path.join(baseDir, 'scripts'),
      scriptMode: 'fast',
    } as any;

    const progressStore = (getLanguageProgressMock as any).__store as Map<string, any> | undefined;
    if (progressStore) {
      for (const language of cfg.languages as string[]) {
        if (!progressStore.has(language)) {
          progressStore.set(language, {
            languageCode: language,
            transcriptionDone: false,
            captionsDone: false,
            videoPartsDone: false,
            finalVideoDone: false,
            disabled: false,
            failedStep: null,
            failureReason: null,
          });
        }
      }
    }

    await handleMetadataPhase({
      projectId,
      cfg,
      daemonConfig,
    });

    expect(generateMetadataMock).toHaveBeenCalledTimes(2);
    const firstCall = generateMetadataMock.mock.calls[0][0];
    const secondCall = generateMetadataMock.mock.calls[1][0];
    expect(firstCall.targetBlockCount).toBeUndefined();
    expect(secondCall.targetBlockCount).toBe(4);

    const esMetadataPath = path.join(workspaceRoot, 'es', 'metadata', 'transcript-blocks.json');
    const esMetadata = JSON.parse(await fs.readFile(esMetadataPath, 'utf8'));
    expect(esMetadata.blocks).toHaveLength(4);

    expect(setStatusMock).toHaveBeenCalled();
    const statusPayload = setStatusMock.mock.calls.at(-1);
    expect(statusPayload?.[1]).toBe(ProjectStatus.ProcessCaptionsVideo);
  });
});
