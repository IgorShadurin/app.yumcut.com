import { z } from 'zod';
import { ProjectStatus } from '@/shared/constants/status';

export const serviceStatusSchema = z.object({
  status: z.nativeEnum(ProjectStatus),
  message: z.string().optional(),
  extra: z.record(z.string(), z.any()).optional(),
});

export const serviceAssetSchema = z.object({
  type: z.enum(['audio', 'image', 'video']),
  path: z.string().min(1),
  isFinal: z.boolean().optional(),
});
