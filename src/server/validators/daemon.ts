import { z } from 'zod';
import { ProjectStatus } from '@/shared/constants/status';
import { LANGUAGE_ENUM } from '@/shared/constants/languages';

export const daemonStatusUpdateSchema = z.object({
  status: z.nativeEnum(ProjectStatus),
  message: z.string().optional().nullable(),
  extra: z.record(z.string(), z.any()).optional(),
});

export const daemonScriptUpsertSchema = z.object({
  text: z.string().min(1, 'Script text is required'),
  languageCode: LANGUAGE_ENUM.optional(),
});

export const daemonAssetRegisterSchema = z
  .object({
    type: z.enum(['audio', 'image', 'video']),
    url: z.string().min(1),
    path: z.string().min(1).optional(),
    isFinal: z.coerce.boolean().optional(),
    localPath: z.string().optional(),
    languageCode: LANGUAGE_ENUM.optional(),
  });

export const daemonJobStatusSchema = z.object({
  status: z.enum(['queued', 'running', 'done', 'failed', 'paused']),
});

export const daemonJobCreateSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.string(), z.any()).optional(),
});

export const daemonJobExistsQuerySchema = z.object({
  projectId: z.string().min(1),
  type: z.string().min(1),
});

export const daemonClaimJobsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(10),
});

export const daemonEligibleProjectsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(10),
});
