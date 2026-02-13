import type { PrismaClient } from '@prisma/client';
import {
  PLACEHOLDER_AUDIO_URL,
  PLACEHOLDER_IMAGE_URL,
  PLACEHOLDER_VIDEO_URL,
  TITLE_PREFIX,
  buildScriptText,
} from '../dummy-constants';
import { statusMessage } from '../status-message';

export async function createBasicStatusProjects(
  prisma: PrismaClient,
  statuses: string[],
  userId: string,
  batchSuffixOverride?: string,
) {
  const batchSuffix = batchSuffixOverride ?? new Date().toISOString().replace(/[:.]/g, '-');

  const scriptStageIndex = statuses.indexOf('process_script_validate');
  const audioStageIndex = statuses.indexOf('process_audio_validate');
  const audioFinalIndex = statuses.indexOf('process_transcription');
  const imageStageIndex = statuses.indexOf('process_images_generation');
  const videoStageIndex = statuses.indexOf('process_video_parts_generation');
  const videoFinalIndex = statuses.indexOf('done');

  const scriptText = buildScriptText('en');

  for (const status of statuses) {
    const orderIndex = statuses.indexOf(status);
    const slug = status.replace(/_/g, '-');
    const promptText = `Dummy prompt for ${status}.`;
    const audioPath = `dummy/audio/${slug}.mp3`;
    const videoPath = `dummy/video/${slug}.mp4`;
    const imagePath = `dummy/image/${slug}.png`;

    const project = await prisma.project.create({
      data: {
        userId,
        title: `${TITLE_PREFIX} [${status}] ${batchSuffix}`,
        prompt: promptText,
        rawScript: `Raw script placeholder for ${status}.`,
        status,
        languages: ['en'],
        finalScriptText: orderIndex >= scriptStageIndex ? scriptText : null,
        finalVoiceoverPath: null,
        finalVoiceoverUrl: null,
        finalVideoPath: null,
        finalVideoUrl: null,
      },
    });

    await prisma.projectStatusHistory.create({
      data: {
        projectId: project.id,
        status,
        message: statusMessage(status),
      },
    });

    await prisma.job.create({
      data: {
        projectId: project.id,
        userId,
        type: `dummy_${slug}`,
        status: 'done',
        payload: { generatedAt: new Date().toISOString(), status },
      },
    }).catch(() => undefined);

    let audioCandidateId: string | null = null;

    if (orderIndex >= scriptStageIndex) {
      await prisma.script.upsert({
        where: { projectId_languageCode: { projectId: project.id, languageCode: 'en' } },
        update: { text: scriptText },
        create: { projectId: project.id, languageCode: 'en', text: scriptText },
      });
    }

    if (orderIndex >= audioStageIndex) {
      const audio = await prisma.audioCandidate.create({
        data: {
          projectId: project.id,
          path: audioPath,
          publicUrl: PLACEHOLDER_AUDIO_URL,
          localPath: audioPath,
          languageCode: 'en',
        },
      });
      audioCandidateId = audio.id;
      if (orderIndex >= audioFinalIndex) {
        await prisma.project.update({
          where: { id: project.id },
          data: {
            finalVoiceoverId: audio.id,
            finalVoiceoverPath: audioPath,
            finalVoiceoverUrl: PLACEHOLDER_AUDIO_URL,
          },
        });
      }
    }

    if (orderIndex >= imageStageIndex) {
      await prisma.imageAsset.create({
        data: {
          projectId: project.id,
          path: imagePath,
          publicUrl: PLACEHOLDER_IMAGE_URL,
        },
      });
    }

    if (orderIndex >= videoStageIndex) {
      const video = await prisma.videoAsset.create({
        data: {
          projectId: project.id,
          path: videoPath,
          publicUrl: PLACEHOLDER_VIDEO_URL,
          isFinal: orderIndex >= videoFinalIndex,
          languageCode: 'en',
        },
      });
      if (orderIndex >= videoFinalIndex) {
        await prisma.project.update({
          where: { id: project.id },
          data: {
            finalVideoPath: videoPath,
            finalVideoUrl: PLACEHOLDER_VIDEO_URL,
          },
        });
      }
    }

    if (status === 'error' && audioCandidateId) {
      await prisma.project.update({
        where: { id: project.id },
        data: { finalVoiceoverId: audioCandidateId },
      }).catch(() => undefined);
    }

    console.log(`Created dummy project "${project.title}" with status ${status}.`);
  }

  console.log('Dummy project creation complete.');
}
