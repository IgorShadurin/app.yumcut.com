import { z } from 'zod';

// Helpers
const urlString = z.string().url().max(512);
const relativePath = z.string().max(512).refine((val) => /^\/[^/\s][^\s]*$/.test(val), {
  message: 'Must be an absolute URL or a relative path starting with /',
});
const previewResource = z.union([urlString, relativePath]);
const optUrl = z.string().url().max(512).optional().or(z.literal('')).transform(v => v || undefined);
const optString = (max: number) => z.string().max(max).optional().or(z.literal('')).transform(v => v || undefined);
// Relation id: allow string id or null (used to clear relation on PATCH); undefined means "leave unchanged".
const relId = z.union([z.string().max(36), z.null()]).optional();

export const artStyleInput = z.object({
  title: z.string().min(1).max(255),
  description: optString(4096),
  prompt: z.string().min(1),
  referenceImageUrl: optUrl,
  isPublic: z.boolean().optional().default(false),
});

export const voiceStyleInput = z.object({
  title: z.string().min(1).max(255),
  description: optString(4096),
  prompt: z.string().min(1),
  isPublic: z.boolean().optional().default(false),
});

export const voiceInput = z.object({
  title: z.string().min(1).max(255),
  description: optString(4096),
  externalId: optString(128),
  isPublic: z.boolean().optional().default(false),
});

export const musicInput = z.object({
  title: z.string().min(1).max(255),
  url: urlString,
  description: optString(4096),
  isPublic: z.boolean().optional().default(false),
});

export const captionsStyleInput = z.object({
  title: z.string().min(1).max(255),
  description: optString(4096),
  externalId: optString(128),
  isPublic: z.boolean().optional().default(false),
});

export const overlayInput = z.object({
  title: z.string().min(1).max(255),
  url: urlString,
  description: optString(4096),
  isPublic: z.boolean().optional().default(false),
});

export const templateInput = z.object({
  code: z.string().min(1).max(255),
  title: z.string().min(1).max(255),
  description: optString(4096),
  previewImageUrl: previewResource,
  previewVideoUrl: z.string().url().max(512),
  textPrompt: z.string().min(1),
  weight: z.number().int().min(0).max(1000).optional().default(0),
  captionsStyleId: relId,
  overlayId: relId,
  artStyleId: relId,
  voiceStyleId: relId,
  voiceId: relId,
  musicId: relId,
  isPublic: z.boolean().optional().default(false),
});

export type ArtStyleInput = z.infer<typeof artStyleInput>;
export type VoiceStyleInput = z.infer<typeof voiceStyleInput>;
export type VoiceInput = z.infer<typeof voiceInput>;
export type MusicInput = z.infer<typeof musicInput>;
export type CaptionsStyleInput = z.infer<typeof captionsStyleInput>;
export type OverlayInput = z.infer<typeof overlayInput>;
export type TemplateInput = z.infer<typeof templateInput>;

export type AdminEntity =
  | 'templates'
  | 'art-styles'
  | 'voice-styles'
  | 'voices'
  | 'music'
  | 'captions-styles'
  | 'overlays';

export function schemaFor(entity: AdminEntity) {
  switch (entity) {
    case 'templates': return templateInput;
    case 'art-styles': return artStyleInput;
    case 'voice-styles': return voiceStyleInput;
    case 'voices': return voiceInput;
    case 'music': return musicInput;
    case 'captions-styles': return captionsStyleInput;
    case 'overlays': return overlayInput;
  }
}
