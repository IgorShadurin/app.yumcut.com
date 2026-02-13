import type { PrismaClient } from '@prisma/client';
import {
  PLACEHOLDER_AUDIO_URL,
  PLACEHOLDER_IMAGE_URL,
  PLACEHOLDER_VIDEO_URL,
  TITLE_PREFIX,
  buildScriptText,
} from '../dummy-constants';

export async function createMultilangProjects(
  prisma: PrismaClient,
  languageCodes: string[],
  userId: string,
  batchSuffix: string,
) {
    if (languageCodes.length === 0) return;
  const scriptTexts = languageCodes.reduce<Record<string, string>>((acc, code) => {
    acc[code] = buildScriptText(code);
    return acc;
  }, {});

  const scriptProject = await prisma.project.create({
    data: {
      userId,
      title: `${TITLE_PREFIX} [multi-script-review] ${batchSuffix}`,
      prompt: 'Review multilingual scripts before approval.',
      rawScript: 'Seeded multi-language script review project.',
      status: 'process_script_validate',
      languages: languageCodes,
      finalScriptText: null,
    },
  });

  await prisma.projectStatusHistory.create({
    data: {
      projectId: scriptProject.id,
      status: 'process_script_validate',
      message: 'Awaiting script approval in all languages.',
    },
  });

  await prisma.job.create({
    data: {
      projectId: scriptProject.id,
      userId,
      type: 'dummy_multilang_script',
      status: 'running',
      payload: { stage: 'script_review', languages: languageCodes },
    },
  }).catch(() => undefined);

  for (const code of languageCodes) {
    await prisma.script.upsert({
      where: { projectId_languageCode: { projectId: scriptProject.id, languageCode: code } },
      update: { text: scriptTexts[code] },
      create: {
        projectId: scriptProject.id,
        languageCode: code,
        text: scriptTexts[code],
      },
    });
  }

  const audioProject = await prisma.project.create({
    data: {
      userId,
      title: `${TITLE_PREFIX} [multi-audio-review] ${batchSuffix}`,
      prompt: 'Review multilingual audio candidates before continuing.',
      rawScript: 'Seeded multi-language audio review project.',
      status: 'process_audio_validate',
      languages: languageCodes,
      finalScriptText: scriptTexts[languageCodes[0]] ?? null,
    },
  });

  await prisma.projectStatusHistory.create({
    data: {
      projectId: audioProject.id,
      status: 'process_audio_validate',
      message: 'Awaiting audio approval in all languages.',
    },
  });

  await prisma.job.create({
    data: {
      projectId: audioProject.id,
      userId,
      type: 'dummy_multilang_audio',
      status: 'running',
      payload: { stage: 'audio_review', languages: languageCodes },
    },
  }).catch(() => undefined);

  for (const code of languageCodes) {
    await prisma.script.upsert({
      where: { projectId_languageCode: { projectId: audioProject.id, languageCode: code } },
      update: { text: scriptTexts[code] },
      create: {
        projectId: audioProject.id,
        languageCode: code,
        text: scriptTexts[code],
      },
    });

    const slug = code.toLowerCase();
    const audioPath = `dummy/audio/${slug}.mp3`;

    await prisma.audioCandidate.create({
      data: {
        projectId: audioProject.id,
        path: audioPath,
        publicUrl: PLACEHOLDER_AUDIO_URL,
        localPath: audioPath,
        languageCode: code,
      },
    });
  }

  const audioCandidatesProject = await prisma.project.create({
    data: {
      userId,
      title: `${TITLE_PREFIX} [multi-audio-candidates] ${batchSuffix}`,
      prompt: 'Review multiple audio candidates for each language before continuing.',
      rawScript: 'Seeded multi-language audio review project with several candidates.',
      status: 'process_audio_validate',
      languages: languageCodes,
      finalScriptText: scriptTexts[languageCodes[0]] ?? null,
    },
  });

  await prisma.projectStatusHistory.create({
    data: {
      projectId: audioCandidatesProject.id,
      status: 'process_audio_validate',
      message: 'Awaiting audio approval with multiple candidates in all languages.',
    },
  });

  await prisma.job.create({
    data: {
      projectId: audioCandidatesProject.id,
      userId,
      type: 'dummy_multilang_audio_candidates',
      status: 'running',
      payload: { stage: 'audio_review', variant: 'multiple_candidates', languages: languageCodes },
    },
  }).catch(() => undefined);

  for (const code of languageCodes) {
    await prisma.script.upsert({
      where: { projectId_languageCode: { projectId: audioCandidatesProject.id, languageCode: code } },
      update: { text: scriptTexts[code] },
      create: {
        projectId: audioCandidatesProject.id,
        languageCode: code,
        text: scriptTexts[code],
      },
    });

    const langSlug = code.toLowerCase();
    for (let candidateIndex = 1; candidateIndex <= 3; candidateIndex += 1) {
      const audioPath = `dummy/audio/${langSlug}-candidate-${candidateIndex}.mp3`;
      const audioUrl = `${PLACEHOLDER_AUDIO_URL}?lang=${langSlug}&candidate=${candidateIndex}`;

      await prisma.audioCandidate.create({
        data: {
          projectId: audioCandidatesProject.id,
          path: audioPath,
          publicUrl: audioUrl,
          localPath: audioPath,
          languageCode: code,
        },
      });
    }
  }

  const finalProject = await prisma.project.create({
    data: {
      userId,
      title: `${TITLE_PREFIX} [multi-done] ${batchSuffix}`,
      prompt: 'Completed multilingual project with approved assets.',
      rawScript: 'Seeded multi-language completed project.',
      status: 'done',
      languages: languageCodes,
      finalScriptText: scriptTexts[languageCodes[0]] ?? null,
    },
  });

  await prisma.projectStatusHistory.create({
    data: {
      projectId: finalProject.id,
      status: 'done',
      message: 'All languages processed successfully.',
      extra: { languages: languageCodes },
    },
  });

  let primaryVoiceoverId: string | null = null;
  let primaryVoiceoverPath: string | null = null;
  let primaryVoiceoverUrl: string | null = null;
  let primaryFinalVideoPath: string | null = null;
  let primaryFinalVideoUrl: string | null = null;

  let supportsLanguageProgress = true;

  for (const code of languageCodes) {
    await prisma.script.upsert({
      where: { projectId_languageCode: { projectId: finalProject.id, languageCode: code } },
      update: { text: scriptTexts[code] },
      create: {
        projectId: finalProject.id,
        languageCode: code,
        text: scriptTexts[code],
      },
    });

    const langSlug = code.toLowerCase();
    const audioPath = `dummy/audio/final-${langSlug}.mp3`;
    const audioUrl = `${PLACEHOLDER_AUDIO_URL}?lang=${langSlug}`;
    const audio = await prisma.audioCandidate.create({
      data: {
        projectId: finalProject.id,
        path: audioPath,
        publicUrl: audioUrl,
        localPath: audioPath,
        languageCode: code,
        isFinal: true,
      },
    });

    if (code === languageCodes[0]) {
      primaryVoiceoverId = audio.id;
      primaryVoiceoverPath = audioPath;
      primaryVoiceoverUrl = audioUrl;
    }

    const videoPath = `dummy/video/final-${langSlug}.mp4`;
    const videoUrl = `${PLACEHOLDER_VIDEO_URL}?lang=${langSlug}`;
    await prisma.videoAsset.create({
      data: {
        projectId: finalProject.id,
        path: videoPath,
        publicUrl: videoUrl,
        isFinal: true,
        languageCode: code,
      },
    });

    if (code === languageCodes[0]) {
      primaryFinalVideoPath = videoPath;
      primaryFinalVideoUrl = videoUrl;
    }

    if (supportsLanguageProgress) {
      try {
        await prisma.projectLanguageProgress.upsert({
          where: { projectId_languageCode: { projectId: finalProject.id, languageCode: code } },
          create: {
            projectId: finalProject.id,
            languageCode: code,
            transcriptionDone: true,
            captionsDone: true,
            videoPartsDone: true,
            finalVideoDone: true,
          },
          update: {
            transcriptionDone: true,
            captionsDone: true,
            videoPartsDone: true,
            finalVideoDone: true,
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2021') {
          supportsLanguageProgress = false;
        } else {
          throw err;
        }
      }
    }
  }

  await prisma.project.update({
    where: { id: finalProject.id },
    data: {
      finalVoiceoverId: primaryVoiceoverId,
      finalVoiceoverPath: primaryVoiceoverPath,
      finalVoiceoverUrl: primaryVoiceoverUrl,
      finalVideoPath: primaryFinalVideoPath,
      finalVideoUrl: primaryFinalVideoUrl,
    },
  });
}
