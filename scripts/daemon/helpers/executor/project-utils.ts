import { normalizeLanguageList, DEFAULT_LANGUAGE, TargetLanguageCode } from '@/shared/constants/languages';
import type { CreationSnapshot } from './types';
import { log } from '../logger';

export const TEMPLATE_DEFAULT_EFFECT = 'basic';

export function resolveProjectLanguagesFromSnapshot(cfg: CreationSnapshot): TargetLanguageCode[] {
  const rawLanguages = Array.isArray((cfg as any).languages) && (cfg as any).languages.length > 0
    ? (cfg as any).languages
    : [cfg.targetLanguage];
  return normalizeLanguageList(rawLanguages, DEFAULT_LANGUAGE) as TargetLanguageCode[];
}

export function determineEffectName(projectId: string, template: CreationSnapshot['template'] | null | undefined): string {
  const templateCode = (template?.code ?? '').trim();
  if (templateCode) return templateCode;
  log.info('Template missing effect code; using default', {
    projectId,
    templateId: template?.id,
    templateCode: template?.code,
    effect: TEMPLATE_DEFAULT_EFFECT,
  });
  return TEMPLATE_DEFAULT_EFFECT;
}

export function languageNameForCli(code: string | null | undefined): string | null {
  switch ((code || '').toLowerCase()) {
    case 'en':
      return 'English';
    case 'ru':
      return 'Russian';
    case 'es':
      return 'Spanish';
    case 'fr':
      return 'French';
    case 'de':
      return 'German';
    case 'pt':
      return 'Portuguese';
    case 'it':
      return 'Italian';
    default:
      return null;
  }
}
