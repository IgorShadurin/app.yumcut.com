import { issueSignedStorageCommand } from '@/lib/upload-signature';
import { config } from './config';

let inferredPublicBase: string | undefined;
let cachedMediaRoot: string | undefined;
const STORAGE_DELETE_PREFIXES = ['characters/', 'audio/', 'image/', 'video/'];
let cachedAppOrigin: string | null | undefined;

function normalizeBaseUrl(base: string) {
  return base.replace(/\/+$/, '');
}

function storagePublicBase() {
  const raw = (process.env.NEXT_PUBLIC_STORAGE_BASE_URL || config.STORAGE_PUBLIC_URL || '').trim();
  if (raw && raw.length > 0) {
    const normalized = normalizeBaseUrl(raw);
    inferredPublicBase = normalized;
    return normalized;
  }
  return inferredPublicBase;
}

export function mediaRoot(): string {
  if (cachedMediaRoot) return cachedMediaRoot;
  const raw = (process.env.MEDIA_ROOT || '').trim() || (config as any).MEDIA_ROOT || '';
  const resolved = raw.length > 0 ? raw : (process.cwd() + '/media');
  const root = resolved.replace(/\/+$/, '');
  cachedMediaRoot = root;
  return root;
}

export function recordStoragePublicUrlHint(possibleUrl: string | null | undefined) {
  if (!possibleUrl || possibleUrl.length === 0) return;
  if (config.STORAGE_PUBLIC_URL && config.STORAGE_PUBLIC_URL.trim().length > 0) {
    // Explicit configuration wins; no need to infer.
    return;
  }
  try {
    const parsed = new URL(possibleUrl);
    inferredPublicBase = normalizeBaseUrl(parsed.origin);
  } catch {
    // Ignore invalid URLs (e.g., relative paths)
  }
}

function ensureNoTraversal(segment: string) {
  if (segment === '..') {
    throw new Error('Path traversal segment not allowed');
  }
}

export function buildPublicMediaUrl(relativePath: string) {
  const stored = toStoredMediaPath(relativePath);
  const encoded = stored.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  const base = storagePublicBase();
  if (base) {
    return `${base}/api/media/${encoded}`;
  }
  return `/api/media/${encoded}`;
}

export function normalizeMediaUrl(relativePath: string | null | undefined) {
  if (!relativePath) return null;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  return buildPublicMediaUrl(relativePath);
}

export function toStoredMediaPath(input: string) {
  if (!input) throw new Error('Media path is required');
  let working = input.trim();
  if (/^https?:\/\//i.test(working)) {
    let parsed: URL;
    try {
      parsed = new URL(working);
    } catch (err) {
      throw new Error(`Invalid media URL: ${working}`);
    }
    working = parsed.pathname || '';
    if (!working) {
      throw new Error('Media URL must include a path');
    }
    if (parsed.pathname.startsWith('/api/media/')) {
      working = parsed.pathname;
    } else {
      throw new Error('Media URL must originate from /api/media on the storage host');
    }
  }
  if (working.startsWith('/api/media/')) {
    working = working.slice('/api/media/'.length);
    working = working
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  }
  if (working.startsWith('/')) {
    working = working.replace(/^\/+/, '');
  }
  const lowerWorking = working.toLowerCase();
  const disallowedPrefixes = ['media/', 'files/', 'project/', 'daemon/'];
  for (const prefix of disallowedPrefixes) {
    if (lowerWorking.startsWith(prefix)) {
      throw new Error(`Unsupported media path prefix: ${working}`);
    }
  }
  const segments = working.split(/[\\/]+/).filter((seg) => seg.length > 0);
  segments.forEach(ensureNoTraversal);
  if (segments.length === 0) {
    throw new Error('Media path is required');
  }
  return segments.join('/');
}

function resolveStorageServiceBase() {
  const candidates = [process.env.NEXT_PUBLIC_STORAGE_BASE_URL, config.STORAGE_PUBLIC_URL];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) {
      return value.replace(/\/+$/, '');
    }
  }
  return null;
}

function resolveAppRequestOrigin() {
  if (cachedAppOrigin !== undefined) return cachedAppOrigin;
  const candidates = [
    process.env.NEXT_PUBLIC_APP_BASE_URL,
    process.env.APP_BASE_URL,
    process.env.NEXTAUTH_URL,
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      cachedAppOrigin = parsed.origin;
      return cachedAppOrigin;
    } catch {
      cachedAppOrigin = value;
      return cachedAppOrigin;
    }
  }
  cachedAppOrigin = null;
  return cachedAppOrigin;
}

function isDeletableStoragePath(path: string) {
  const lower = path.toLowerCase();
  return STORAGE_DELETE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function normalizeDeleteCandidates(paths: Array<string | null | undefined>) {
  const normalized = new Set<string>();
  for (const candidate of paths) {
    if (!candidate) continue;
    try {
      const stored = toStoredMediaPath(candidate);
      if (!isDeletableStoragePath(stored)) {
        continue;
      }
      normalized.add(stored);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('deleteStoredMedia: unable to normalize path', candidate, err);
      }
    }
  }
  return Array.from(normalized);
}

export async function deleteStoredMedia(paths: Array<string | null | undefined>, options: { userId: string }) {
  if (!options.userId || options.userId.trim().length === 0) {
    throw new Error('deleteStoredMedia: userId is required when deleting via storage service');
  }
  const normalizedPaths = normalizeDeleteCandidates(paths);
  if (normalizedPaths.length === 0) {
    return;
  }

  const base = resolveStorageServiceBase();
  if (!base) {
    throw new Error('deleteStoredMedia: storage service base URL is not configured');
  }

  const command = issueSignedStorageCommand({
    type: 'delete-user-media',
    userId: options.userId,
    paths: normalizedPaths,
  });

  const response = await fetch(`${base}/api/storage/user-media/delete`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(resolveAppRequestOrigin() ? { origin: resolveAppRequestOrigin()! } : {}),
    },
    body: JSON.stringify({ data: command.data, signature: command.signature }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`deleteStoredMedia: storage service responded ${response.status}${text ? ` - ${text}` : ''}`);
  }
}

export async function removeCharacterImage(relativePath: string | null | undefined, options: { userId?: string } = {}) {
  if (!relativePath) return;
  if (!options.userId || options.userId.trim().length === 0) {
    throw new Error('removeCharacterImage: userId is required when deleting via storage service');
  }
  await deleteStoredMedia([relativePath], { userId: options.userId });
}
