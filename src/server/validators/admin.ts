import { z } from 'zod';
import { ProjectStatus } from '@/shared/constants/status';
import { LANGUAGE_ENUM } from '@/shared/constants/languages';

export const adminProjectStatusSchema = z.object({
  status: z.nativeEnum(ProjectStatus),
  resetProgress: z.boolean().optional().default(true),
  languagesToReset: z.array(LANGUAGE_ENUM).optional(),
});
