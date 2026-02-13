import path from 'path';
import { promises as fs } from 'fs';
import { loadConfig } from './config';

/**
 * Helpers that keep daemon artifacts grouped by language.
 * These utilities are tightly coupled: the scaffold builders return metadata that the
 * log helpers extend, so they intentionally live in the same file.
 */

function getCfg() {
  return loadConfig();
}

export type ProjectScaffold = {
  projectRoot: string;
  workspaceRoot: string;
  logsRoot: string;
};

export type LanguageWorkspace = ProjectScaffold & {
  languageCode: string;
  languageWorkspace: string;
  languageLogsRoot: string;
};

export type TemplateWorkspace = ProjectScaffold & {
  templateKey: string;
  templateRoot: string;
  templateWorkspace: string;
  templateLogsRoot: string;
};

function normalizeLanguageCode(languageCode: string | null | undefined): string {
  const normalized = (languageCode ?? '').trim().toLowerCase();
  if (!normalized) {
    throw new Error('Language code is required for workspace scaffolding');
  }
  if (!/^[a-z0-9-]+$/u.test(normalized)) {
    throw new Error(`Invalid language code "${languageCode}"`);
  }
  return normalized;
}

async function ensureDir(target: string) {
  await fs.mkdir(target, { recursive: true });
}

export async function ensureProjectScaffold(projectId: string): Promise<ProjectScaffold> {
  const cfg = getCfg();
  const projectRoot = path.join(cfg.projectsWorkspace, projectId);
  const workspaceRoot = path.join(projectRoot, 'workspace');
  const logsRoot = path.join(projectRoot, 'logs');
  await ensureDir(projectRoot);
  await Promise.all([ensureDir(workspaceRoot), ensureDir(logsRoot)]);
  return { projectRoot, workspaceRoot, logsRoot };
}

function sanitizeTemplateKey(input?: string | null): string {
  const trimmed = (input ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  const normalized = trimmed.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return normalized || '';
}

export async function ensureTemplateWorkspace(
  projectId: string,
  templateCode?: string | null,
  templateId?: string | null,
): Promise<TemplateWorkspace> {
  const scaffold = await ensureProjectScaffold(projectId);
  const fromCode = sanitizeTemplateKey(templateCode);
  const fromId = sanitizeTemplateKey(templateId);
  const templateKey = fromCode || fromId || 'default';
  const templateRoot = path.join(scaffold.workspaceRoot, 'template', templateKey);
  const templateWorkspace = path.join(templateRoot, 'workspace');
  const templateLogsRoot = path.join(templateRoot, 'logs');
  await Promise.all([ensureDir(templateRoot), ensureDir(templateWorkspace), ensureDir(templateLogsRoot)]);
  return {
    ...scaffold,
    templateKey,
    templateRoot,
    templateWorkspace,
    templateLogsRoot,
  };
}

export async function ensureLanguageWorkspace(projectId: string, languageCodeRaw: string): Promise<LanguageWorkspace> {
  const languageCode = normalizeLanguageCode(languageCodeRaw);
  const scaffold = await ensureProjectScaffold(projectId);
  const languageWorkspace = path.join(scaffold.workspaceRoot, languageCode);
  const languageLogsRoot = path.join(scaffold.logsRoot, languageCode);
  await Promise.all([ensureDir(languageWorkspace), ensureDir(languageLogsRoot)]);
  return {
    ...scaffold,
    languageCode,
    languageWorkspace,
    languageLogsRoot,
  };
}

export async function ensureLanguageLogDir(info: LanguageWorkspace, kind: string): Promise<string> {
  const sanitized = kind.trim().replace(/[^a-z0-9-]/giu, '-');
  const dir = path.join(info.languageLogsRoot, sanitized);
  await ensureDir(dir);
  return dir;
}

export async function ensureErrorsLogDir(projectId: string): Promise<string> {
  const scaffold = await ensureProjectScaffold(projectId);
  const dir = path.join(scaffold.logsRoot, 'errors');
  await ensureDir(dir);
  return dir;
}

export function resolveLanguageAudioDir(info: LanguageWorkspace): string {
  return path.join(info.languageWorkspace, 'audio');
}

export function resolveLanguageScriptsDir(info: LanguageWorkspace): string {
  return path.join(info.languageWorkspace, 'scripts');
}

export function resolveLanguageTranslationsDir(info: LanguageWorkspace): string {
  return path.join(resolveLanguageScriptsDir(info), 'translations');
}
