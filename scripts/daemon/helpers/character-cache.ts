import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { log } from './logger';
import { loadConfig } from './config';

const daemonConfig = loadConfig();
const cacheDir = path.join(daemonConfig.projectsWorkspace, '.cache', 'characters');
const urlCache = new Map<string, string>();
const pendingDownloads = new Map<string, Promise<string>>();

async function ensureCacheDir() {
  await fs.mkdir(cacheDir, { recursive: true });
}

function sanitizeExtension(input: string | null | undefined) {
  if (!input) return '.png';
  const ext = input.toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return ext;
  return '.png';
}

async function downloadWithRetry(url: string, dest: string): Promise<string> {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      await fs.writeFile(dest, Buffer.from(arrayBuffer));
      return dest;
    } catch (err) {
      if (attempt === attempts) {
        throw err;
      }
      log.warn('Failed to download character image, retrying', {
        url,
        attempt,
        remaining: attempts - attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  return dest;
}

async function fetchAndCache(url: string): Promise<string> {
  await ensureCacheDir();
  const urlObj = new URL(url);
  const ext = sanitizeExtension(path.extname(urlObj.pathname));
  const hash = crypto.createHash('sha1').update(url).digest('hex');
  const dest = path.join(cacheDir, `${hash}${ext}`);
  await downloadWithRetry(url, dest);
  urlCache.set(url, dest);
  return dest;
}

export async function resolveCharacterImagePath(options: {
  projectId: string;
  imageUrl?: string | null;
}): Promise<string | null> {
  const { projectId, imageUrl } = options;

  if (!imageUrl) return null;

  const cached = urlCache.get(imageUrl);
  if (cached) {
    try {
      const stat = await fs.stat(cached);
      if (stat.isFile()) {
        return cached;
      }
      urlCache.delete(imageUrl);
    } catch {
      urlCache.delete(imageUrl);
    }
  }

  if (pendingDownloads.has(imageUrl)) {
    return pendingDownloads.get(imageUrl) ?? null;
  }

  const downloadPromise = (async () => {
    try {
      const localPath = await fetchAndCache(imageUrl);
      return localPath;
    } catch (err) {
      log.error('Failed to download character image', {
        projectId,
        imageUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      pendingDownloads.delete(imageUrl);
    }
  })();

  pendingDownloads.set(imageUrl, downloadPromise);
  return downloadPromise;
}
