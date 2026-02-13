import path from 'path';
import { promises as fs } from 'fs';
import { runNpmCommand } from './video/run-npm-command';

export type LaunchSnapshot = {
  textScript: Record<string, string>;
  images: string[];
  imageMetadata: ImageGenerationMetadata[];
};

export type ImageGenerationMetadata = {
  image: string;
  model: string;
  prompt: string;
  sentence?: string | null;
  size?: string | null;
  raw: Record<string, unknown>;
};

export type TemplateLaunchArgs = {
  projectId: string;
  scriptWorkspaceV2: string;
  templatePath: string;
  modulePath?: string | null;
  workspaceDir: string;
  commandsWorkspaceRoot?: string | null;
  logDir: string;
  durationSeconds: number;
  languages?: string[];
  userPrompt?: string | null;
  userTextPath?: string | null;
  autoApprove?: boolean;
};

export type TemplateLaunchResult = {
  snapshot: LaunchSnapshot;
  resultPath: string;
  logPath: string;
  displayCommand: string;
};

export async function runTemplateLaunch(args: TemplateLaunchArgs): Promise<TemplateLaunchResult> {
  const {
    projectId,
    scriptWorkspaceV2,
    templatePath,
    modulePath,
    workspaceDir,
    commandsWorkspaceRoot,
    logDir,
    durationSeconds,
    languages,
    userPrompt,
    userTextPath,
    autoApprove = true,
  } = args;

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Template launch requires a positive durationSeconds value');
  }

  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(logDir, { recursive: true });

  const cliArgs = buildCliArgs({
    templatePath: resolveCliPath(templatePath, scriptWorkspaceV2),
    modulePath: modulePath ? resolveCliPath(modulePath, scriptWorkspaceV2) : null,
    workspaceDir,
    durationSeconds,
    languages,
    userPrompt,
    userTextPath,
    autoApprove,
  });

  const run = await runNpmCommand({
    projectId,
    cwd: scriptWorkspaceV2,
    workspaceRoot: commandsWorkspaceRoot ?? workspaceDir,
    args: cliArgs,
    logDir,
    logName: 'template-launch',
  });

  const resultPath = path.join(workspaceDir, 'result.json');
  const snapshot = await readResultSnapshot(resultPath);

  return {
    snapshot,
    resultPath,
    logPath: run.logPath,
    displayCommand: run.displayCommand,
  };
}

export async function loadTemplateLaunchSnapshotIfExists(resultPath: string): Promise<LaunchSnapshot | null> {
  try {
    await fs.access(resultPath);
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
  return readResultSnapshot(resultPath);
}

function buildCliArgs(params: {
  templatePath: string;
  modulePath: string | null;
  workspaceDir: string;
  durationSeconds: number;
  languages?: string[];
  userPrompt?: string | null;
  userTextPath?: string | null;
  autoApprove: boolean;
}): string[] {
  const args = ['run', 'template:launch', '--', '--template', params.templatePath, '--workspace', params.workspaceDir, '--duration', String(Math.round(params.durationSeconds))];
  if (params.modulePath) {
    args.push('--module', params.modulePath);
  }
  const normalizedLanguages = (params.languages || [])
    .map((code) => (typeof code === 'string' ? code.trim() : ''))
    .filter((code) => code.length > 0);
  if (normalizedLanguages.length > 0) {
    args.push('--languages', normalizedLanguages.join(','));
  }
  const hasPrompt = typeof params.userPrompt === 'string' && params.userPrompt.trim().length > 0;
  const normalizedPrompt = hasPrompt ? params.userPrompt! : null;
  const normalizedUserText = typeof params.userTextPath === 'string' && params.userTextPath.trim().length > 0 ? params.userTextPath.trim() : null;
  if (normalizedPrompt && normalizedUserText) {
    throw new Error('Template launch requires exactly one of userPrompt or userTextPath');
  }
  if (normalizedUserText) {
    args.push('--user-text', normalizedUserText);
  } else if (normalizedPrompt) {
    args.push('--user-prompt', normalizedPrompt);
  }
  if (!params.autoApprove) {
    args.push('--no-auto-approve');
  }
  return args;
}

function resolveCliPath(candidate: string, workspace: string): string {
  if (path.isAbsolute(candidate)) {
    return candidate;
  }
  return path.join(workspace, candidate);
}

async function readResultSnapshot(resultPath: string): Promise<LaunchSnapshot> {
  let raw: unknown;
  try {
    const file = await fs.readFile(resultPath, 'utf8');
    raw = JSON.parse(file);
  } catch (err: any) {
    throw new Error(`Failed to read template launch result at ${resultPath}: ${err?.message || err}`);
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid template launch result at ${resultPath}`);
  }
  const snapshot = raw as { textScript?: unknown; images?: unknown };
  const textScript: Record<string, string> = {};
  if (snapshot.textScript && typeof snapshot.textScript === 'object' && !Array.isArray(snapshot.textScript)) {
    for (const [key, value] of Object.entries(snapshot.textScript)) {
      if (typeof value === 'string' && value.trim()) {
        const normalizedKey = key.trim().toLowerCase();
        if (!normalizedKey) continue;
        textScript[normalizedKey] = path.resolve(value.trim());
      }
    }
  }
  const images: string[] = Array.isArray(snapshot.images)
    ? snapshot.images
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => path.resolve(entry.trim()))
    : [];
  const imageMetadata = await readImageMetadata(path.dirname(resultPath));
  return { textScript, images, imageMetadata };
}

async function readImageMetadata(workspaceDir: string): Promise<ImageGenerationMetadata[]> {
  const metadataPath = path.join(workspaceDir, 'image-generation', 'images.json');
  let file: string;
  try {
    file = await fs.readFile(metadataPath, 'utf8');
  } catch (err: any) {
    if (err?.code === 'ENOENT') return [];
    throw new Error(`Failed to read image metadata at ${metadataPath}: ${err?.message || err}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(file);
  } catch (err: any) {
    throw new Error(`Failed to parse image metadata at ${metadataPath}: ${err?.message || err}`);
  }
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid image metadata at ${metadataPath}: expected an array`);
  }
  const results: ImageGenerationMetadata[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Invalid image metadata at ${metadataPath}[${index}]: expected an object`);
    }
    const record = entry as Record<string, unknown>;
    const image = requireStringField(record, 'image', `${metadataPath}[${index}].image`);
    const model = requireStringField(record, 'model', `${metadataPath}[${index}].model`);
    const prompt = requireStringField(record, 'prompt', `${metadataPath}[${index}].prompt`);
    const sentence = optionalStringField(record, 'sentence', `${metadataPath}[${index}].sentence`);
    const size = optionalStringField(record, 'size', `${metadataPath}[${index}].size`);
    results.push({ image, model, prompt, sentence, size, raw: { ...record } });
  });
  return results;
}

function requireStringField(record: Record<string, unknown>, key: string, pathLabel: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid image metadata at ${pathLabel}: expected a non-empty string`);
  }
  return value;
}

function optionalStringField(record: Record<string, unknown>, key: string, pathLabel: string): string | null {
  if (!(key in record)) return null;
  const value = record[key];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new Error(`Invalid image metadata at ${pathLabel}: expected a string`);
  }
  return value;
}

export const __templateLaunchInternals = {
  buildCliArgs,
  resolveCliPath,
  readResultSnapshot,
  readImageMetadata,
};
