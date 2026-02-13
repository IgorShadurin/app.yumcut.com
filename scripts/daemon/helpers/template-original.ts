import path from 'path';
import { promises as fs } from 'fs';
import { resolveLanguageScriptsDir, type LanguageWorkspace } from './language-workspace';

const TEMPLATE_ORIGINAL_POINTER = 'template-original-path.txt';
const TEMPLATE_ORIGINAL_FILENAME = 'template-original.txt';

export async function rememberTemplateOriginalPath(languageInfo: LanguageWorkspace, templateScriptPath: string): Promise<string> {
  const scriptsDir = resolveLanguageScriptsDir(languageInfo);
  await fs.mkdir(scriptsDir, { recursive: true });
  const pointerPath = path.join(scriptsDir, TEMPLATE_ORIGINAL_POINTER);
  const absoluteSource = path.resolve(templateScriptPath);
  await fs.writeFile(pointerPath, absoluteSource, 'utf8');
  return pointerPath;
}

export async function saveTemplateOriginalScript(languageInfo: LanguageWorkspace, contents: string): Promise<string> {
  const scriptsDir = resolveLanguageScriptsDir(languageInfo);
  await fs.mkdir(scriptsDir, { recursive: true });
  const targetPath = path.join(scriptsDir, TEMPLATE_ORIGINAL_FILENAME);
  await fs.writeFile(targetPath, contents, 'utf8');
  return targetPath;
}

export async function readTemplateOriginalPath(languageInfo: LanguageWorkspace): Promise<string | null> {
  const pointerPath = path.join(resolveLanguageScriptsDir(languageInfo), TEMPLATE_ORIGINAL_POINTER);
  let storedPath: string;
  try {
    storedPath = (await fs.readFile(pointerPath, 'utf8')).trim();
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
  if (!storedPath) {
    return null;
  }
  const absolute = path.resolve(storedPath);
  try {
    await fs.access(absolute);
    return absolute;
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}
