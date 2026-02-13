import path from 'path';
import { prisma } from './db';
import { mediaRoot } from './storage';

export type MediaOwner = { projectId: string; userId: string };

function pathVariants(original: string) {
  const normalized = original.replace(/\\/g, '/');
  let trimmed = normalized;
  while (trimmed.startsWith('./')) trimmed = trimmed.slice(2);
  if (trimmed.startsWith('/')) trimmed = trimmed.slice(1);
  const lowerTrimmed = trimmed.toLowerCase();
  const disallowedPrefixes = ['media/', 'files/', 'project/', 'daemon/'];
  if (disallowedPrefixes.some((prefix) => lowerTrimmed.startsWith(prefix))) {
    throw new Error(`Unsupported media path prefix: ${original}`);
  }

  const variants = new Set<string>();
  variants.add(normalized);
  variants.add(trimmed);
  variants.add(trimmed.replace(/\//g, '\\'));

  const root = mediaRoot();
  const absoluteForward = path.join(root, trimmed).replace(/\\/g, '/');
  const absoluteBack = absoluteForward.replace(/\//g, '\\');
  variants.add(absoluteForward);
  variants.add(absoluteBack);

  return Array.from(variants);
}

async function findViaAudio(path: string) {
  const variants = pathVariants(path);
  const record = await prisma.audioCandidate.findFirst({
    where: { path: { in: variants } },
    select: { projectId: true, project: { select: { userId: true } } },
  });
  if (!record) return null;
  return { projectId: record.projectId, userId: record.project.userId } satisfies MediaOwner;
}

async function findViaImage(path: string) {
  const variants = pathVariants(path);
  const record = await prisma.imageAsset.findFirst({
    where: { path: { in: variants } },
    select: { projectId: true, project: { select: { userId: true } } },
  });
  if (!record) return null;
  return { projectId: record.projectId, userId: record.project.userId } satisfies MediaOwner;
}

async function findViaVideo(path: string) {
  const variants = pathVariants(path);
  const record = await prisma.videoAsset.findFirst({
    where: { path: { in: variants } },
    select: { projectId: true, project: { select: { userId: true } } },
  });
  if (!record) return null;
  return { projectId: record.projectId, userId: record.project.userId } satisfies MediaOwner;
}

async function findViaUserCharacter(path: string) {
  const variants = pathVariants(path);
  const record = await prisma.userCharacterVariation.findFirst({
    where: { imagePath: { in: variants }, deleted: false, userCharacter: { deleted: false } },
    select: { userCharacter: { select: { userId: true, id: true } } },
  });
  if (!record || !record.userCharacter) return null;
  return { projectId: record.userCharacter.id, userId: record.userCharacter.userId } satisfies MediaOwner;
}

async function findViaProject(path: string) {
  const variants = pathVariants(path);
  const record = await prisma.project.findFirst({
    where: {
      OR: variants.flatMap((p) => ([
        { finalVoiceoverPath: p },
        { finalVideoPath: p },
      ])),
    },
    select: { id: true, userId: true },
  });
  if (!record) return null;
  return { projectId: record.id, userId: record.userId } satisfies MediaOwner;
}

export async function resolveMediaOwner(path: string): Promise<MediaOwner | null> {
  const audio = await findViaAudio(path);
  if (audio) return audio;
  const image = await findViaImage(path);
  if (image) return image;
  const video = await findViaVideo(path);
  if (video) return video;
  const userCharacter = await findViaUserCharacter(path);
  if (userCharacter) return userCharacter;
  const project = await findViaProject(path);
  if (project) return project;
  return null;
}
