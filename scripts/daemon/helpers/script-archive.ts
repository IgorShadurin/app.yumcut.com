import { promises as fs } from 'fs';
import path from 'path';
import { loadConfig } from './config';
import { log } from './logger';
import { ensureLanguageWorkspace, resolveLanguageScriptsDir } from './language-workspace';

const cfg = loadConfig();

const SEPARATOR = '\n----------------------------------------\n\n';

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function nextInitialPath(projectDir: string) {
  const base = path.join(projectDir, 'initial-script.txt');
  try {
    await fs.access(base);
    // If already exists, append timestamp to avoid loss.
    const stamp = new Date().toISOString().replaceAll(':', '-');
    return path.join(projectDir, `initial-script-${stamp}.txt`);
  } catch {
    return base;
  }
}

async function nextRefinePath(projectDir: string) {
  await ensureDir(projectDir);
  const files = await fs.readdir(projectDir);
  let maxSuccessIndex = 0;
  for (const file of files) {
    const match = /^refine(\d+)(?:-error)?\.txt$/i.exec(file);
    if (match) {
      const num = Number.parseInt(match[1], 10);
      const isError = file.includes('-error');
      if (!isError && Number.isFinite(num) && num > maxSuccessIndex) {
        maxSuccessIndex = num;
      }
    }
  }
  const nextIndex = maxSuccessIndex + 1;
  return { index: nextIndex, filePath: path.join(projectDir, `refine${nextIndex}.txt`) };
}

export type InitialArchiveParams = {
  projectId: string;
  languageCode: string;
  command: string;
  prompt: string;
  durationSeconds: number | null;
  language?: string | null;
  mustHave?: string | null;
  avoid?: string | null;
  output: string;
};

export type RefinementArchiveParams = {
  projectId: string;
  languageCode: string;
  command: string;
  notes: string;
  durationSeconds: number | null;
  output: string;
};

function buildInitialContent(params: InitialArchiveParams) {
  const lines: string[] = [];
  lines.push('Command:', params.command);
  lines.push(SEPARATOR);
  lines.push('Inputs:');
  lines.push(`Prompt: ${params.prompt}`);
  if (params.mustHave) lines.push(`Must-have: ${params.mustHave}`);
  if (params.avoid) lines.push(`Avoid: ${params.avoid}`);
  if (params.language) lines.push(`Language: ${params.language}`);
  if (params.durationSeconds != null) lines.push(`Duration (s): ${params.durationSeconds}`);
  lines.push(SEPARATOR);
  lines.push('Output:');
  lines.push(params.output);
  return lines.join('\n');
}

function buildRefineContent(params: RefinementArchiveParams, index: number) {
  const lines: string[] = [];
  lines.push('Command:', params.command);
  lines.push(SEPARATOR);
  lines.push(`Refinement Notes (#${index}):`);
  lines.push(params.notes);
  if (params.durationSeconds != null) {
    lines.push(`\nRequested duration (s): ${params.durationSeconds}`);
  }
  lines.push(SEPARATOR);
  lines.push('Output:');
  lines.push(params.output);
  return lines.join('\n');
}

async function scriptsDirFor(projectId: string, languageCode: string) {
  const info = await ensureLanguageWorkspace(projectId, languageCode);
  const dir = resolveLanguageScriptsDir(info);
  await ensureDir(dir);
  return dir;
}

export async function archiveInitialSuccess(params: InitialArchiveParams) {
  const projectDir = await scriptsDirFor(params.projectId, params.languageCode);
  const filePath = await nextInitialPath(projectDir);
  const tmp = filePath + `.tmp-${Date.now()}`;
  await fs.writeFile(tmp, buildInitialContent(params), 'utf8');
  await fs.rename(tmp, filePath);
  log.info('Archived initial script', { projectId: params.projectId, filePath });
}

export async function archiveInitialError(projectId: string, languageCode: string, command: string, message: string) {
  const projectDir = await scriptsDirFor(projectId, languageCode);
  let target = path.join(projectDir, 'initial-script-error.txt');
  try {
    await fs.access(target);
    const stamp = new Date().toISOString().replaceAll(':', '-');
    target = path.join(projectDir, `initial-script-error-${stamp}.txt`);
  } catch {}
  const content = ['Command:', command, SEPARATOR, 'Error:', message].join('\n');
  await fs.writeFile(target, content, 'utf8');
  log.warn('Archived initial script error', { projectId, filePath: target });
}

export async function archiveRefinementSuccess(params: RefinementArchiveParams) {
  const projectDir = await scriptsDirFor(params.projectId, params.languageCode);
  const { index, filePath } = await nextRefinePath(projectDir);
  const tmp = filePath + `.tmp-${Date.now()}`;
  await fs.writeFile(tmp, buildRefineContent(params, index), 'utf8');
  await fs.rename(tmp, filePath);
  log.info('Archived refined script', { projectId: params.projectId, filePath, index });
}

export async function archiveRefinementError(
  projectId: string,
  languageCode: string,
  command: string,
  message: string,
  notes: string | undefined,
) {
  const projectDir = await scriptsDirFor(projectId, languageCode);
  const { index } = await nextRefinePath(projectDir);
  const base = path.join(projectDir, `refine${index}-error.txt`);
  const target = base;
  const parts: string[] = [];
  parts.push('Command:', command);
  if (notes && notes.trim()) {
    parts.push(SEPARATOR, `Refinement Notes (#${index}):`, notes.trim());
  }
  parts.push(SEPARATOR, 'Error:', message);
  await fs.writeFile(target, parts.join('\n'), 'utf8');
  log.warn('Archived refinement error', { projectId, filePath: target, index });
}
