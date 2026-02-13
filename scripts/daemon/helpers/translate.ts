import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { loadConfig } from './config';
import { getLanguageLabel, TargetLanguageCode, normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { log } from './logger';
import { runNpmCommand } from './video/run-npm-command';
import { generateScript } from './prompt-to-text';
import { ensureLanguageWorkspace, ensureLanguageLogDir, resolveLanguageTranslationsDir } from './language-workspace';

export interface TranslateScriptOptions {
  projectId: string;
  sourceLanguage: string | TargetLanguageCode;
  targetLanguage: string | TargetLanguageCode;
  sourceText: string;
  context?: string | null;
}

function normalizeCode(input: string | TargetLanguageCode): TargetLanguageCode {
  const arr = normalizeLanguageList(input, DEFAULT_LANGUAGE);
  return arr[0];
}

export async function translateScript(options: TranslateScriptOptions): Promise<string> {
  const cfg = loadConfig();
  const targetCode = normalizeCode(options.targetLanguage);
  const targetLabel = getLanguageLabel(targetCode);
  const sourceCode = normalizeCode(options.sourceLanguage);
  const sourceLabel = getLanguageLabel(sourceCode);

  if (process.env.MOCK_TRANSLATION === '1') {
    return `(${targetLabel}) ${options.sourceText}`;
  }

  if (!options.sourceText || !options.sourceText.trim()) {
    throw new Error('Source text is required for translation');
  }

  const languageInfo = await ensureLanguageWorkspace(options.projectId, targetCode);
  const translationWorkspace = resolveLanguageTranslationsDir(languageInfo);
  const logsDir = await ensureLanguageLogDir(languageInfo, 'translation');
  await fs.mkdir(translationWorkspace, { recursive: true });

  const slug = `${targetCode}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const inputPath = path.join(translationWorkspace, `source-${slug}.txt`);
  const outputPath = path.join(translationWorkspace, `translated-${slug}.txt`);
  await fs.writeFile(inputPath, options.sourceText, 'utf8');

  const cleanup = async (options: { keepInput?: boolean; keepOutput?: boolean } = {}) => {
    const { keepInput = false, keepOutput = false } = options;
    if (!keepInput) {
      try { await fs.unlink(inputPath); } catch {}
    }
    if (!keepOutput) {
      try { await fs.unlink(outputPath); } catch {}
    }
  };

  log.info('Translating script', {
    projectId: options.projectId,
    sourceLanguage: sourceLabel,
    targetLanguage: targetLabel,
    inputPath,
    outputPath,
  });

  const args = [
    'run',
    '-s',
    'text:translate',
    '--',
    `--input=${inputPath}`,
    `--output=${outputPath}`,
    `--language=${targetLabel}`,
  ];
  if (options.context && options.context.trim().length > 0) {
    args.push(`--context=${options.context.trim()}`);
  }

  try {
    await runNpmCommand({
      projectId: options.projectId,
      cwd: cfg.scriptWorkspaceV2,
      workspaceRoot: languageInfo.workspaceRoot,
      args,
      logDir: logsDir,
      logName: `translate-${targetCode}`,
    });
  } catch (cliError: any) {
    log.error('Translation CLI failed, falling back to prompt translation', {
      projectId: options.projectId,
      sourceLanguage: sourceLabel,
      targetLanguage: targetLabel,
      error: cliError?.message || String(cliError),
    });
    await cleanup();

    const promptParts: string[] = [
      `Translate the following ${sourceLabel} script into ${targetLabel}.`,
      'Keep the meaning, tone, and formatting identical to the original.',
      'Return only the translated text with no additional commentary.',
      '---',
      options.sourceText,
    ];

    if (options.context && options.context.trim().length > 0) {
      promptParts.splice(2, 0, `Context: ${options.context.trim()}`);
    }

    const result = await generateScript({
      prompt: promptParts.join('\n\n'),
      durationSeconds: null,
      language: targetLabel,
      workspaceRoot: languageInfo.workspaceRoot,
    });
    return result.text.trim();
  }

  try {
    const translated = await fs.readFile(outputPath, 'utf8');
    const text = translated.trim();
    if (!text) {
      throw new Error(`Translation output for ${targetLabel} is empty`);
    }
    return text;
  } finally {
    await cleanup({ keepOutput: true });
  }
}
