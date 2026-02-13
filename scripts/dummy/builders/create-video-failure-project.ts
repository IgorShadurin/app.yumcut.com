import type { PrismaClient } from '@prisma/client';
import { PLACEHOLDER_AUDIO_URL, PLACEHOLDER_VIDEO_URL, TITLE_PREFIX, buildScriptText } from '../dummy-constants';

type VideoFailureConfig = {
  languages: string[];
  errors: Record<string, string>;
  logs: Record<string, string>;
};

const DEFAULT_FAILURE: VideoFailureConfig = {
  languages: ['en', 'es', 'pt'],
  errors: {
    en: 'Renderer exited with code 137 (GPU out of memory)',
    es: 'FFmpeg mux failed: audio stream header missing',
  },
  logs: {
    en: '/var/log/yumcut/projects/video/en/2025-11-03T10-32-11.log',
    es: '/var/log/yumcut/projects/video/es/2025-11-03T10-32-14.log',
  },
};

export async function createVideoFailureProject(
  prisma: PrismaClient,
  userId: string,
  batchSuffix: string,
  config: VideoFailureConfig = DEFAULT_FAILURE,
) {
  const { languages, errors, logs } = config;
  const scriptTexts = languages.reduce<Record<string, string>>((acc, lang) => {
    acc[lang] = buildScriptText(lang);
    return acc;
  }, {});

  const failureSet = new Set(Object.keys(errors).map((lang) => lang.toLowerCase()));
  const completedLanguages: string[] = [];
  const failedLanguages: string[] = [];
  const videoLogs: Record<string, string> = { ...logs };
  const videoErrors: Record<string, string> = { ...errors };
  const finalVideoPaths: Record<string, string> = {};
  const successVideoMap: Record<string, { path: string; url: string | null }> = {};
  const audioMap: Record<string, { id: string; path: string; url: string | null }> = {};

  const project = await prisma.project.create({
    data: {
      userId,
      title: `${TITLE_PREFIX} [multi-video-errors] ${batchSuffix}`,
      prompt: 'Seeded project demonstrating per-language video failures.',
      rawScript: 'Dummy project where final video rendering fails differently per language.',
      status: 'process_video_main',
      languages,
      finalScriptText: scriptTexts[languages[0]] ?? buildScriptText(languages[0]),
    },
  });

  await prisma.job.create({
    data: {
      projectId: project.id,
      userId,
      type: 'video_main',
      status: 'failed',
      payload: {
        stage: 'video_main',
        errors,
        logs,
      },
    },
  }).catch(() => undefined);

  for (const languageCode of languages) {
    const lower = languageCode.toLowerCase();
    const audioPath = `dummy/audio/video-${lower}.mp3`;
    const audioUrl = `${PLACEHOLDER_AUDIO_URL}?lang=${lower}&variant=video-main`;
    const scriptText = scriptTexts[languageCode] ?? buildScriptText(languageCode);
    const isFailed = failureSet.has(lower);

    await prisma.script.upsert({
      where: { projectId_languageCode: { projectId: project.id, languageCode } },
      update: { text: scriptText },
      create: {
        projectId: project.id,
        languageCode,
        text: scriptText,
      },
    });

    const audioCandidate = await prisma.audioCandidate.create({
      data: {
        projectId: project.id,
        path: audioPath,
        publicUrl: audioUrl,
        localPath: audioPath,
        languageCode,
        isFinal: true,
      },
    });
    audioMap[languageCode] = {
      id: audioCandidate.id,
      path: audioCandidate.path,
      url: audioCandidate.publicUrl,
    };

    if (isFailed) {
      failedLanguages.push(languageCode);
      await prisma.projectLanguageProgress.upsert({
        where: { projectId_languageCode: { projectId: project.id, languageCode } },
        create: {
          projectId: project.id,
          languageCode,
          transcriptionDone: true,
          captionsDone: true,
          videoPartsDone: true,
          finalVideoDone: false,
          disabled: true,
          failedStep: 'video_main',
          failureReason: errors[languageCode] ?? 'Unknown failure',
        },
        update: {
          transcriptionDone: true,
          captionsDone: true,
          videoPartsDone: true,
          finalVideoDone: false,
          disabled: true,
          failedStep: 'video_main',
          failureReason: errors[languageCode] ?? 'Unknown failure',
        },
      });
    } else {
      const videoPath = `dummy/video/video-success-${lower}.mp4`;
      const videoUrl = `${PLACEHOLDER_VIDEO_URL}?lang=${lower}&variant=video-main`;
      await prisma.videoAsset.create({
        data: {
          projectId: project.id,
          path: videoPath,
          publicUrl: videoUrl,
          isFinal: true,
          languageCode,
        },
      });
      await prisma.projectLanguageProgress.upsert({
        where: { projectId_languageCode: { projectId: project.id, languageCode } },
        create: {
          projectId: project.id,
          languageCode,
          transcriptionDone: true,
          captionsDone: true,
          videoPartsDone: true,
          finalVideoDone: true,
          disabled: false,
          failedStep: null,
          failureReason: null,
        },
        update: {
          transcriptionDone: true,
          captionsDone: true,
          videoPartsDone: true,
          finalVideoDone: true,
          disabled: false,
          failedStep: null,
          failureReason: null,
        },
      });
      completedLanguages.push(languageCode);
      finalVideoPaths[languageCode] = videoPath;
      successVideoMap[languageCode] = { path: videoPath, url: videoUrl };
    }
  }

  // Update status history with final lists
  const updatedExtra = {
    failedLanguages,
    completedLanguages,
    pendingLanguages: [],
    videoLogs,
    videoErrors,
    finalVideoPaths,
  };
  await prisma.projectStatusHistory.create({
    data: {
      projectId: project.id,
      status: 'process_video_main',
      message: 'Video rendering failed for some languages.',
      extra: updatedExtra,
    },
  });

  const preferredVideoLang = completedLanguages[0] ?? languages[0];
  const preferredVideo = successVideoMap[preferredVideoLang];
  const preferredAudio = audioMap[preferredVideoLang] ?? audioMap[languages[0]];

  await prisma.project.update({
    where: { id: project.id },
    data: {
      finalVoiceoverId: preferredAudio?.id ?? null,
      finalVoiceoverPath: preferredAudio?.path ?? null,
      finalVoiceoverUrl: preferredAudio?.url ?? null,
      finalVideoPath: preferredVideo?.path ?? null,
      finalVideoUrl: preferredVideo?.url ?? null,
    },
  }).catch(() => undefined);

  console.log(`Created multilingual video error project "${project.title}".`);
}
