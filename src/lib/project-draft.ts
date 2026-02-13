import type { PendingProjectDraft } from '@/shared/types';

const DRAFT_PREFIX = 'project-draft:';

export function storeProjectDraft(draft: PendingProjectDraft) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${DRAFT_PREFIX}${draft.id}`, JSON.stringify(draft));
  } catch (error) {
    // If storage fails (quota, private mode), ignore so flow can continue.
    console.error('Failed to persist project draft', error);
  }
}

export function loadProjectDraft(draftId: string): PendingProjectDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${DRAFT_PREFIX}${draftId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingProjectDraft;
    if (parsed?.settings && typeof parsed.settings.watermarkEnabled !== 'boolean') {
      parsed.settings.watermarkEnabled = true;
    }
    if (parsed?.settings && typeof (parsed.settings as any).captionsEnabled !== 'boolean') {
      (parsed.settings as any).captionsEnabled = true;
    }
    if (parsed?.settings && typeof (parsed.settings as any).includeCallToAction !== 'boolean') {
      (parsed.settings as any).includeCallToAction = true;
    }
    if (!Array.isArray(parsed?.settings?.targetLanguages) || parsed.settings.targetLanguages.length === 0) {
      parsed.settings.targetLanguages = ['en'];
    }
    if (parsed?.settings && (parsed.settings as any).targetLanguage) {
      delete (parsed.settings as any).targetLanguage;
    }
    if (!Array.isArray(parsed?.languageCodes) || parsed.languageCodes.length === 0) {
      parsed.languageCodes = parsed?.languageCode ? [parsed.languageCode] : ['en'];
    }
    return parsed;
  } catch (error) {
    console.error('Failed to load project draft', error);
    try {
      window.sessionStorage.removeItem(`${DRAFT_PREFIX}${draftId}`);
    } catch {}
    return null;
  }
}

export function deleteProjectDraft(draftId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(`${DRAFT_PREFIX}${draftId}`);
  } catch (error) {
    console.error('Failed to delete project draft', error);
  }
}
