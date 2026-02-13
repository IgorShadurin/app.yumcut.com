#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import { ProjectStatus } from '../src/shared/constants/status';
import { DEFAULT_LANGUAGE } from '../src/shared/constants/languages';
import { toStoredMediaPath } from '../src/server/storage';
import { jobTypeForStatus } from '../src/shared/pipeline/job-types';
import { buildProgressResetPlan, resetDownstreamJobs, resetStageJobs } from '../src/server/pipeline/resets';

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
    // ignore if missing
  }
}

function validateStatus(input: string): input is ProjectStatus {
  return (Object.values(ProjectStatus) as string[]).includes(input);
}

function printUsage(message?: string): never {
  if (message) {
    console.error(message);
    console.error('');
  }
  console.error('Usage: npx tsx scripts/update-project-status.ts <projectId> <status> [data-json] [--no-job-reset] [--no-downstream-reset] [--no-progress-reset]');
  console.error('');
  console.error('Available statuses:');
  for (const status of Object.values(ProjectStatus)) {
    console.error(`- ${status}`);
  }
  process.exit(1);
}

async function main() {
  const root = process.cwd();
  loadDotEnv(root);
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Create .env at repo root.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const [projectId, statusArgRaw, ...rest] = args;
  if (!projectId || !statusArgRaw) {
    printUsage('Missing required arguments.');
  }
  if (!validateStatus(statusArgRaw)) {
    printUsage(`Invalid status: ${statusArgRaw}.`);
  }

  const statusArg = statusArgRaw as ProjectStatus;

  let dataJson: string | undefined;
  const flags: string[] = [];
  const flagStart = rest.findIndex((value) => value.startsWith('--'));
  if (flagStart === -1) {
    if (rest.length > 0) dataJson = rest[0];
  } else {
    if (flagStart > 0) {
      dataJson = rest[0];
    }
    flags.push(...rest.slice(flagStart));
  }
  if (flagStart === -1 && rest.length > 1) {
    flags.push(...rest.slice(1));
  }

  const unsupported = flags.filter((flag) => !['--no-job-reset', '--no-downstream-reset', '--no-progress-reset'].includes(flag));
  if (unsupported.length > 0) {
    printUsage(`Unknown flag(s): ${unsupported.join(', ')}`);
  }
  const skipJobReset = flags.includes('--no-job-reset');
  const skipDownstreamReset = flags.includes('--no-downstream-reset');
  const skipProgressReset = flags.includes('--no-progress-reset');
  const resetProgress = !skipProgressReset;

  let extra: Record<string, unknown> | undefined;
  if (dataJson) {
    try {
      const parsed = JSON.parse(dataJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        printUsage('data must be a JSON object, e.g. {"progress":0.5}');
      }
      extra = parsed as Record<string, unknown>;
    } catch (e: any) {
      printUsage(`Failed to parse data JSON: ${e?.message || String(e)}`);
    }
  }

  const prisma = new PrismaClient();
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      printUsage('Project not found');
    }
    const progressPlan = buildProgressResetPlan(statusArg);

    await prisma.$transaction(async (tx) => {
      if (statusArg === ProjectStatus.ProcessScriptValidate && extra && typeof extra['scriptText'] === 'string') {
        const scriptText = String(extra['scriptText']);
        if (scriptText.trim().length === 0) {
          printUsage('scriptText cannot be empty when provided');
        }
        const languageCode = typeof (extra as any)['languageCode'] === 'string'
          ? String((extra as any)['languageCode'])
          : DEFAULT_LANGUAGE;
        await tx.script.upsert({
          where: { projectId_languageCode: { projectId, languageCode } },
          create: { projectId, languageCode, text: scriptText },
          update: { text: scriptText },
        });
      }

      if (statusArg === ProjectStatus.ProcessAudioValidate && extra && Array.isArray((extra as any)['audios'])) {
        const audios = (extra as any)['audios'] as unknown[];
        const urls = audios.filter((value): value is string => typeof value === 'string' && value.length > 0);
        if (urls.length === 0) {
          printUsage('audios must be a non-empty array of strings when provided');
        }
        await tx.audioCandidate.deleteMany({ where: { projectId } });
        for (const url of urls) {
          const stored = toStoredMediaPath(url);
          await tx.audioCandidate.create({ data: { projectId, path: stored, publicUrl: url } });
        }
      }

      const projectUpdate: Prisma.ProjectUpdateInput = { status: statusArg };

      if (statusArg === ProjectStatus.ProcessAudio && extra && typeof extra['scriptText'] === 'string') {
        projectUpdate.finalScriptText = String(extra['scriptText']);
      }
      if (extra && typeof (extra as any)['finalScriptText'] === 'string') {
        projectUpdate.finalScriptText = String((extra as any)['finalScriptText']);
      }

      if (extra && (((extra as any)['finalVoiceoverId']) || ((extra as any)['approvedAudioId']) || ((extra as any)['finalVoiceoverPath']))) {
        const finalIdRaw = ((extra as any)['finalVoiceoverId'] as string) || ((extra as any)['approvedAudioId'] as string) || '';
        const finalId = finalIdRaw ? String(finalIdRaw) : '';
        let finalUrl: string | null = null;
        if ((extra as any)['finalVoiceoverPath']) {
          finalUrl = String((extra as any)['finalVoiceoverPath']);
        }
        let finalPath: string | null = null;
        if (finalUrl) {
          finalPath = toStoredMediaPath(finalUrl);
        }
        if (!finalUrl && finalId) {
          const cand = await tx.audioCandidate.findUnique({
            where: { id: finalId },
            select: { path: true, publicUrl: true },
          });
          finalUrl = cand?.publicUrl ?? null;
          finalPath = cand?.path ?? null;
        }
        projectUpdate.finalVoiceoverId = finalId || null;
        projectUpdate.finalVoiceoverPath = finalPath ?? null;
        projectUpdate.finalVoiceoverUrl = finalUrl ?? null;
      }

      if (resetProgress && progressPlan.clearFinalVideo) {
        projectUpdate.finalVideoPath = null;
        projectUpdate.finalVideoUrl = null;
      }

      await tx.project.update({ where: { id: projectId }, data: projectUpdate });

      await tx.projectStatusHistory.create({
        data: { projectId, status: statusArg, message: 'Updated via CLI', extra: extra as any },
      });

      if (resetProgress && progressPlan.fields.length > 0) {
        await tx.projectLanguageProgress.updateMany({
          where: { projectId },
          data: progressPlan.updateData,
        });
      }
      if (resetProgress && progressPlan.clearFinalVideo) {
        await tx.videoAsset.updateMany({
          where: { projectId },
          data: { isFinal: false },
        });
      }
    });

    let jobResetMessage = '';
    const jobType = jobTypeForStatus(statusArg);
    if (jobType && !skipJobReset) {
      const resetResult = await resetStageJobs(prisma, projectId, jobType);
      jobResetMessage = resetResult.message;
    } else if (jobType && skipJobReset) {
      jobResetMessage = ` Skipped job reset for type ${jobType}.`;
    }

    let downstreamMessage = '';
    if (!skipDownstreamReset) {
      const downstreamJobs = await resetDownstreamJobs(prisma, projectId, statusArg);
      if (downstreamJobs.total > 0) {
        downstreamMessage = ` Reset ${downstreamJobs.total} downstream job(s) (${downstreamJobs.types.join(', ')}).`;
      } else if (downstreamJobs.considered > 0) {
        downstreamMessage = ' No downstream jobs required resetting.';
      }
    } else {
      downstreamMessage = ' Skipped downstream job reset.';
    }

    console.log(
      `Updated project ${projectId} to ${statusArg}${extra ? ' with extra data' : ''}.${jobResetMessage}${downstreamMessage}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Downstream computation and job reset helpers are imported from shared/server to avoid duplication.
