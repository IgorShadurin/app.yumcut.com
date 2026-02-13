#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

import { TITLE_PREFIX } from './dummy/dummy-constants';
import { createBasicStatusProjects } from './dummy/builders/create-basic-projects';
import { createMultilangProjects } from './dummy/builders/create-multilang-projects';
import { createVideoFailureProject } from './dummy/builders/create-video-failure-project';

type Identifier = { email: string } | { id: string };


function loadDotEnv(rootDir: string) {
  const envPath = path.join(rootDir, '.env');
  try {
    const txt = fs.readFileSync(envPath, 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) (process.env as any)[key] = val;
    }
  } catch {
    // ignore missing .env
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const remove = args.includes('--delete');
  const positional = args.filter((arg) => !arg.startsWith('--'));
  if (positional.length === 0) {
    console.error('Usage: npm run projects:dummy -- <email|userId> [--delete]');
    process.exit(1);
  }
  const target = positional[0];
  const identifier: Identifier = target.includes('@') ? { email: target } : { id: target };
  return { identifier, remove };
}

async function resolveConstants() {
  const [{ prisma }, { ProjectStatus }, { LANGUAGES }] = await Promise.all([
    import('../src/server/db'),
    import('../src/shared/constants/status'),
    import('../src/shared/constants/languages'),
  ]);
  const statusOrder: Array<(typeof ProjectStatus)[keyof typeof ProjectStatus]> = [
    ProjectStatus.New,
    ProjectStatus.ProcessScript,
    ProjectStatus.ProcessScriptValidate,
    ProjectStatus.ProcessAudio,
    ProjectStatus.ProcessAudioValidate,
    ProjectStatus.ProcessTranscription,
    ProjectStatus.ProcessMetadata,
    ProjectStatus.ProcessCaptionsVideo,
    ProjectStatus.ProcessImagesGeneration,
    ProjectStatus.ProcessVideoPartsGeneration,
    ProjectStatus.ProcessVideoMain,
    ProjectStatus.Error,
    ProjectStatus.Cancelled,
    ProjectStatus.Done,
  ];
  const languageCodes = LANGUAGES.map((lang) => lang.code);
  return { prisma, ProjectStatus, statusOrder, languageCodes };
}

async function findUser(prisma: Awaited<ReturnType<typeof resolveConstants>>['prisma'], identifier: Identifier) {
  const user = 'email' in identifier
    ? await prisma.user.findUnique({ where: { email: identifier.email } })
    : await prisma.user.findUnique({ where: { id: identifier.id } });
  if (!user) {
    console.error('User not found:', identifier);
    process.exit(1);
  }
  return user;
}

async function deleteDummyProjects(prisma: Awaited<ReturnType<typeof resolveConstants>>['prisma'], userId: string) {
  const projects = await prisma.project.findMany({
    where: { userId, title: { startsWith: TITLE_PREFIX } },
    select: { id: true, title: true },
  });
  if (projects.length === 0) {
    console.log('No dummy projects to delete.');
    return;
  }
  const ids = projects.map((p) => p.id);
  console.log(`Deleting ${ids.length} dummy projects...`);
  await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: ids } } });
  await prisma.audioCandidate.deleteMany({ where: { projectId: { in: ids } } });
  await prisma.imageAsset.deleteMany({ where: { projectId: { in: ids } } });
  await prisma.videoAsset.deleteMany({ where: { projectId: { in: ids } } });
  await prisma.scriptRequest.deleteMany({ where: { projectId: { in: ids } } });
  await prisma.audioRequest.deleteMany({ where: { projectId: { in: ids } } });
  await prisma.projectCharacterSelection.deleteMany({ where: { projectId: { in: ids } } });
  await prisma.script.deleteMany({ where: { projectId: { in: ids } } });
  await prisma.job.deleteMany({ where: { projectId: { in: ids } } });
  await prisma.project.deleteMany({ where: { id: { in: ids } } });
  console.log('Deletion complete.');
}




async function main() {
  loadDotEnv(process.cwd());
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Create .env first.');
    process.exit(1);
  }
  const { identifier, remove } = parseArgs();
  const { prisma, statusOrder, languageCodes } = await resolveConstants();
  try {
    const user = await findUser(prisma, identifier);
    console.log(`Resolved user: ${user.email ?? user.id}`);
    if (remove) {
      await deleteDummyProjects(prisma, user.id);
    } else {
      const batchSuffix = new Date().toISOString().replace(/[:.]/g, '-');
      const statusStrings = statusOrder.map((status) => String(status));

      await createBasicStatusProjects(prisma, statusStrings, user.id, batchSuffix);
      await createMultilangProjects(prisma, languageCodes, user.id, batchSuffix);
      await createVideoFailureProject(prisma, user.id, batchSuffix);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
