import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { log } from './logger';
import { runNpmCommand } from './video/run-npm-command';
import type { ScriptMode } from './config';
import { formatCommandForCommandsLog, withWorkspaceCommandLog } from './commands-log';

const DEFAULT_SCRIPT_MODE: ScriptMode = 'fast';

const DEFAULT_CHARACTER_IMAGE = path.resolve(process.cwd(), 'public/characters/me-2.png');

export type ImageGenerator = 'v1' | 'v2';

type BaseParams = {
  projectId: string;
  workspaceRoot: string;
  commandsWorkspaceRoot?: string | null;
  logDir: string;
  metadataJsonPath: string;
  characterImagePath?: string | null;
  stylePromptPath?: string | null;
  newCharacter?: boolean;
  llmModel?: string | null;
  llmProvider?: string | null;
  scriptMode?: ScriptMode | null;
};

async function assertFile(p: string, label: string) {
  const resolved = path.resolve(p);
  try {
    const stats = await fs.stat(resolved);
    if (!stats.isFile()) throw new Error(`${label} is not a file: ${resolved}`);
  } catch (err: any) {
    throw new Error(`${label} not found at ${resolved}${err?.message ? `: ${err.message}` : ''}`);
  }
  return resolved;
}

async function generateImagesV1(params: BaseParams & { scriptWorkspace: string }) {
  const { projectId, workspaceRoot, commandsWorkspaceRoot, logDir, scriptWorkspace, metadataJsonPath, characterImagePath, stylePromptPath } = params;
  await fs.mkdir(workspaceRoot, { recursive: true });

  await fs.mkdir(logDir, { recursive: true });

  const resolvedBlocks = await assertFile(metadataJsonPath, 'Blocks JSON');
  const resolvedImage = await assertFile(characterImagePath ? characterImagePath : DEFAULT_CHARACTER_IMAGE, 'Character image');

  if (stylePromptPath) await assertFile(stylePromptPath, 'Style prompt file');

  const commandArgs = [
    'tsx',
    'src/comics-draw/generate-images-multiple.ts',
    `--workspace=${workspaceRoot}`,
    `--character-image=${resolvedImage}`,
    `--blocks-json=${resolvedBlocks}`,
  ];
  if (stylePromptPath) {
    commandArgs.push(`--prompt-style=${stylePromptPath}`);
  }

  const displayCommand = `npx ${commandArgs
    .map((arg) => (/^[\w@./:+-]+$/u.test(arg) ? arg : JSON.stringify(arg)))
    .join(' ')}`;
  log.info('Running image generation (v1)', {
    projectId,
    command: displayCommand,
    blocksJson: resolvedBlocks,
    stylePromptPath: stylePromptPath ?? 'default (script-provided)',
  });

  let stdout = '';
  let stderr = '';
  const commandLine = formatCommandForCommandsLog({ cmd: 'npx', args: commandArgs, cwd: scriptWorkspace });
  const exitCode: number = await withWorkspaceCommandLog({
    workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
    commandLine,
    run: async () => {
      const child = spawn('npx', commandArgs, {
        cwd: scriptWorkspace,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      return new Promise((resolve, reject) => {
        child.once('error', (err) => reject(err));
        child.once('close', (code) => resolve(code ?? 0));
      });
    },
  });

  const stamp = new Date().toISOString().replaceAll(':', '-');
  const logPath = path.join(logDir, `images-${stamp}.log`);
  const content = [
    `Command: ${displayCommand}`,
    '\n--- STDOUT ---\n',
    stdout.trim(),
    '\n--- STDERR ---\n',
    stderr.trim(),
    `\nExit code: ${exitCode}`,
  ].join('');
  await fs.writeFile(logPath, content, 'utf8');

  if (exitCode !== 0) {
    const error = new Error(`Image generation failed with code ${exitCode}`);
    (error as any).stdout = stdout;
    (error as any).stderr = stderr;
    (error as any).command = displayCommand;
    throw error;
  }

  log.info('Image generation completed', { projectId, logPath });
  return { logPath, command: displayCommand };
}

async function generateImagesV2(params: BaseParams & { scriptWorkspaceV2: string }) {
  const {
    projectId,
    workspaceRoot,
    commandsWorkspaceRoot,
    logDir,
    scriptWorkspaceV2,
    metadataJsonPath,
    characterImagePath,
    stylePromptPath,
    newCharacter,
    llmModel,
    llmProvider,
    scriptMode,
  } = params;
  const mode: ScriptMode = scriptMode === 'normal' ? 'normal' : DEFAULT_SCRIPT_MODE;
  const fastModeEnabled = mode === 'fast';
  await fs.mkdir(workspaceRoot, { recursive: true });

  await fs.mkdir(logDir, { recursive: true });

  const resolvedBlocks = await assertFile(metadataJsonPath, 'Blocks JSON');
  let resolvedImage: string | null = null;
  if (!newCharacter) {
    resolvedImage = await assertFile(characterImagePath ? characterImagePath : DEFAULT_CHARACTER_IMAGE, 'Character image');
  }
  if (stylePromptPath) await assertFile(stylePromptPath, 'Style prompt file');

  const args = [
    'run',
    '-s',
    'image:blocks-to-qwen',
    '--',
    `--workspace=${workspaceRoot}`,
    `--blocks-json=${resolvedBlocks}`,
  ];
  if (newCharacter) args.push('--new-character');
  else if (resolvedImage) args.push(`--character-image=${resolvedImage}`);
  if (stylePromptPath) args.push(`--style-prompt=${stylePromptPath}`);
  if (llmModel) args.push(`--llm-model=${llmModel}`);
  if (llmProvider) args.push(`--llm-provider=${llmProvider}`);
  if (fastModeEnabled) args.push('--fast');

  const run = await runNpmCommand({
    projectId,
    cwd: scriptWorkspaceV2,
    args,
    workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
    logDir,
    logName: 'images',
  });

  log.info('Image generation completed (v2)', { projectId, logPath: run.logPath, command: run.displayCommand, scriptMode: mode });
  return { logPath: run.logPath, command: run.displayCommand };
}

export async function generateImages(params: (
  BaseParams &
  ({ scriptWorkspace: string; scriptWorkspaceV2?: string; generator?: ImageGenerator } |
   { scriptWorkspace?: string; scriptWorkspaceV2: string; generator?: ImageGenerator })
)) {
  const { projectId, workspaceRoot, logDir, metadataJsonPath, characterImagePath, stylePromptPath } = params;
  const scriptMode: ScriptMode = (params as any).scriptMode === 'normal' ? 'normal' : DEFAULT_SCRIPT_MODE;
  const generator: ImageGenerator = (params as any).generator || 'v2';

  if (generator === 'v2') {
    const ws2 = (params as any).scriptWorkspaceV2 as string | undefined;
    if (!ws2) throw new Error('scriptWorkspaceV2 is required for v2 image generator');
    return generateImagesV2({
      projectId,
      workspaceRoot,
      commandsWorkspaceRoot: (params as any).commandsWorkspaceRoot ?? null,
      logDir,
      scriptWorkspaceV2: ws2,
      metadataJsonPath,
      characterImagePath,
      stylePromptPath,
      newCharacter: (params as any).newCharacter ?? false,
      llmModel: (params as any).llmModel ?? null,
      llmProvider: (params as any).llmProvider ?? null,
      scriptMode,
    });
  }

  // v1 fallback
  const ws1 = (params as any).scriptWorkspace as string | undefined;
  if (!ws1) throw new Error('scriptWorkspace is required for v1 image generator');
  return generateImagesV1({
    projectId,
    workspaceRoot,
    commandsWorkspaceRoot: (params as any).commandsWorkspaceRoot ?? null,
    logDir,
    scriptWorkspace: ws1,
    metadataJsonPath,
    characterImagePath,
    stylePromptPath,
  });
}
