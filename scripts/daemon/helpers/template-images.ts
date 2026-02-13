import path from 'path';
import { promises as fs } from 'fs';
import { log } from './logger';

export type TemplateImageDescriptor = {
  imageName: string;
  url?: string | null;
  path?: string | null;
};

function normalizeFilename(name: string, fallbackIndex: number, sourceUrl?: string | null) {
  const baseName = path.basename(name || '').trim();
  const safeBase = baseName || `image-${String(fallbackIndex).padStart(3, '0')}`;
  const ext = path.extname(safeBase);
  if (ext) return safeBase;
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      const urlExt = path.extname(url.pathname || '');
      if (urlExt) return `${safeBase}${urlExt}`;
    } catch {}
  }
  return `${safeBase}.jpg`;
}

async function downloadWithRetry(url: string, dest: string, projectId: string, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      await fs.writeFile(dest, Buffer.from(arrayBuffer));
      return;
    } catch (err) {
      if (attempt === attempts) {
        throw err;
      }
      log.warn('Failed to download template image, retrying', {
        projectId,
        url,
        attempt,
        remaining: attempts - attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

export async function refreshTemplateImagesFromStorage(options: {
  projectId: string;
  templateWorkspace: string;
  templateImages: TemplateImageDescriptor[];
}): Promise<string> {
  const { projectId, templateWorkspace, templateImages } = options;
  if (!Array.isArray(templateImages) || templateImages.length === 0) {
    throw new Error('No template images available to refresh');
  }
  const imagesDir = path.join(templateWorkspace, 'images');
  await fs.rm(imagesDir, { recursive: true, force: true });
  await fs.mkdir(imagesDir, { recursive: true });

  const seen = new Set<string>();
  let index = 0;
  for (const entry of templateImages) {
    index += 1;
    const sourceUrl = entry.url || entry.path || null;
    if (!sourceUrl) {
      throw new Error(`Template image ${entry.imageName || index} is missing a URL`);
    }
    const fileName = normalizeFilename(entry.imageName, index, sourceUrl);
    if (seen.has(fileName)) {
      throw new Error(`Duplicate template image filename detected: ${fileName}`);
    }
    seen.add(fileName);
    const dest = path.join(imagesDir, fileName);
    await downloadWithRetry(sourceUrl, dest, projectId);
  }

  return imagesDir;
}
