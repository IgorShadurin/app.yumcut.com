import crypto, { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type UploadGrantPurpose = 'user-character-image';

export type StorageCommandType = 'delete-character-image' | 'delete-user-media';
export type DaemonAssetKind = 'audio' | 'image' | 'video' | 'character-image';

export interface UploadGrantPayload {
  version: number;
  userId: string;
  purpose: UploadGrantPurpose;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  maxBytes: number;
  mimeTypes: string[];
}

export interface SignedUploadGrant {
  data: string;
  signature: string;
}

export interface StorageCommandPayload {
  version: number;
  type: StorageCommandType;
  userId: string;
  path?: string;
  paths?: string[];
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

export interface SignedStorageCommand {
  data: string;
  signature: string;
}

export interface DaemonUploadGrantPayload {
  version: number;
  projectId: string;
  kind: DaemonAssetKind;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  maxBytes: number;
  mimeTypes: string[];
}

export interface SignedDaemonUploadGrant {
  data: string;
  signature: string;
}

export interface MediaDownloadGrantPayload {
  version: number;
  path: string;
  userId: string;
  disposition?: 'attachment' | 'inline';
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

export interface SignedMediaDownloadGrant {
  data: string;
  signature: string;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function looksLikePem(input: string) {
  return input.includes('-----BEGIN') && input.includes('-----END');
}

function loadKeyFromEnv(envVar: string | undefined, label: string): string {
  if (!envVar || envVar.trim().length === 0) {
    throw new Error(`${label} is not configured`);
  }
  const trimmed = envVar.trim();

  // Direct PEM contents (supports "\n" encoded newlines)
  if (looksLikePem(trimmed)) {
    return trimmed.replace(/\\n/g, '\n');
  }

  // Treat value as a filesystem path when the file exists.
  const filePath = path.resolve(trimmed);
  if (fs.existsSync(filePath)) {
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch (error: any) {
      throw new Error(`${label} could not be read from ${filePath}: ${error?.message || String(error)}`);
    }
  }

  throw new Error(`${label} does not look like a PEM key and no file was found at ${filePath}`);
}

function ensurePrivateKey(): string {
  return loadKeyFromEnv(process.env.UPLOAD_SIGNING_PRIVATE_KEY, 'UPLOAD_SIGNING_PRIVATE_KEY');
}

function ensurePublicKey(): string {
  return loadKeyFromEnv(process.env.UPLOAD_SIGNING_PUBLIC_KEY, 'UPLOAD_SIGNING_PUBLIC_KEY');
}

function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalSerialize(item)).join(',') + ']';
  }
  const entries = Object.entries(value as Record<string, unknown>) as Array<[string, unknown]>;
  entries.sort((left, right) => left[0].localeCompare(right[0]));
  const serialized = entries
    .map(([key, val]) => `${JSON.stringify(key)}:${canonicalSerialize(val)}`)
    .join(',');
  return `{${serialized}}`;
}

export function issueSignedUploadGrant(params: {
  userId: string;
  purpose: UploadGrantPurpose;
  ttlMs?: number;
}): SignedUploadGrant & { payload: UploadGrantPayload } {
  const now = new Date();
  const ttl = params.ttlMs && params.ttlMs > 0 ? params.ttlMs : DEFAULT_TTL_MS;
  const expires = new Date(now.getTime() + ttl);
  const payload: UploadGrantPayload = {
    version: 1,
    userId: params.userId,
    purpose: params.purpose,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    nonce: Buffer.from(randomBytes(16)).toString('hex'),
    maxBytes: 2 * 1024 * 1024,
    mimeTypes: ['image/png', 'image/jpeg'],
  };
  const data = canonicalSerialize(payload);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const signature = signer.sign(ensurePrivateKey()).toString('base64');
  return { data, signature, payload };
}

export function verifySignedUploadGrant(data: string, signature: string): UploadGrantPayload {
  if (!data || !signature) {
    throw new Error('Missing upload authorization data');
  }
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(data);
  verifier.end();
  const ok = verifier.verify(ensurePublicKey(), Buffer.from(signature, 'base64'));
  if (!ok) {
    throw new Error('Invalid upload signature');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (error) {
    throw new Error('Signed upload payload is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Signed upload payload is not an object');
  }
  const payload = parsed as UploadGrantPayload;
  if (typeof payload.version !== 'number') throw new Error('Signed payload missing version');
  if (typeof payload.userId !== 'string' || payload.userId.length === 0) throw new Error('Signed payload missing userId');
  if (payload.purpose !== 'user-character-image') throw new Error('Signed payload has unsupported purpose');
  if (typeof payload.issuedAt !== 'string' || typeof payload.expiresAt !== 'string') throw new Error('Signed payload missing timestamps');
  if (typeof payload.nonce !== 'string' || payload.nonce.length === 0) throw new Error('Signed payload missing nonce');
  if (typeof payload.maxBytes !== 'number' || payload.maxBytes <= 0) throw new Error('Signed payload missing maxBytes');
  if (!Array.isArray(payload.mimeTypes) || payload.mimeTypes.length === 0) throw new Error('Signed payload missing mimeTypes');
  return payload;
}

export function assertUploadGrantFresh(payload: UploadGrantPayload) {
  const now = Date.now();
  const expires = Date.parse(payload.expiresAt);
  if (Number.isNaN(expires) || expires <= now) {
    throw new Error('Upload grant expired');
  }
}

export function issueSignedStorageCommand(params: {
  type: StorageCommandType;
  userId: string;
  path?: string;
  paths?: string[];
  ttlMs?: number;
}): SignedStorageCommand & { payload: StorageCommandPayload } {
  if (!params.userId || params.userId.trim().length === 0) {
    throw new Error('Storage command requires userId');
  }
  const collectedPaths = [
    ...(Array.isArray(params.paths) ? params.paths : []),
    ...(params.path ? [params.path] : []),
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);
  const uniquePaths = Array.from(new Set(collectedPaths));
  if (uniquePaths.length === 0) {
    throw new Error('Storage command requires at least one path');
  }
  if (params.type === 'delete-character-image' && uniquePaths.length !== 1) {
    throw new Error('delete-character-image command supports exactly one path');
  }
  const now = new Date();
  const ttl = params.ttlMs && params.ttlMs > 0 ? params.ttlMs : DEFAULT_TTL_MS;
  const expires = new Date(now.getTime() + ttl);
  const payload: StorageCommandPayload = {
    version: 1,
    type: params.type,
    userId: params.userId,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    nonce: Buffer.from(randomBytes(16)).toString('hex'),
  };
  if (params.type === 'delete-character-image') {
    payload.path = uniquePaths[0];
  } else {
    payload.paths = uniquePaths;
  }
  const data = canonicalSerialize(payload);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const signature = signer.sign(ensurePrivateKey()).toString('base64');
  return { data, signature, payload };
}

export function verifySignedStorageCommand(data: string, signature: string): StorageCommandPayload {
  if (!data || !signature) {
    throw new Error('Missing storage command data');
  }
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(data);
  verifier.end();
  const ok = verifier.verify(ensurePublicKey(), Buffer.from(signature, 'base64'));
  if (!ok) {
    throw new Error('Invalid storage command signature');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (error) {
    throw new Error('Signed storage payload is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Signed storage payload is not an object');
  }
  const payload = parsed as StorageCommandPayload;
  if (typeof payload.version !== 'number') throw new Error('Signed payload missing version');
  if (payload.type !== 'delete-character-image' && payload.type !== 'delete-user-media') {
    throw new Error('Signed storage payload has unsupported type');
  }
  if (typeof payload.userId !== 'string' || payload.userId.length === 0) throw new Error('Signed payload missing userId');
  if (payload.type === 'delete-character-image') {
    if (typeof payload.path !== 'string' || payload.path.length === 0) throw new Error('Signed payload missing path');
  } else {
    if (!Array.isArray(payload.paths) || payload.paths.length === 0) {
      throw new Error('Signed payload missing paths');
    }
    payload.paths.forEach((pathValue, index) => {
      if (typeof pathValue !== 'string' || pathValue.length === 0) {
        throw new Error(`Signed payload has invalid path entry at index ${index}`);
      }
    });
  }
  if (typeof payload.issuedAt !== 'string' || typeof payload.expiresAt !== 'string') throw new Error('Signed payload missing timestamps');
  if (typeof payload.nonce !== 'string' || payload.nonce.length === 0) throw new Error('Signed payload missing nonce');
  return payload;
}

export function assertStorageCommandFresh(payload: StorageCommandPayload) {
  const now = Date.now();
  const expires = Date.parse(payload.expiresAt);
  if (Number.isNaN(expires) || expires <= now) {
    throw new Error('Storage command expired');
  }
}

export function issueSignedDaemonUploadGrant(params: {
  projectId: string;
  kind: DaemonAssetKind;
  ttlMs?: number;
  maxBytes?: number;
  mimeTypes?: string[];
}): SignedDaemonUploadGrant & { payload: DaemonUploadGrantPayload } {
  if (!params.projectId || params.projectId.trim().length === 0) throw new Error('Daemon upload grant requires projectId');
  if (!params.kind) throw new Error('Daemon upload grant requires kind');
  const now = new Date();
  const ttl = params.ttlMs && params.ttlMs > 0 ? params.ttlMs : DEFAULT_TTL_MS;
  const expires = new Date(now.getTime() + ttl);
  const payload: DaemonUploadGrantPayload = {
    version: 1,
    projectId: params.projectId,
    kind: params.kind,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    nonce: Buffer.from(randomBytes(16)).toString('hex'),
    maxBytes: params.maxBytes ?? 1024 * 1024 * 1024,
    mimeTypes: params.mimeTypes ?? ['audio/wav', 'audio/mpeg', 'audio/mp4', 'image/png', 'image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm'],
  };
  const data = canonicalSerialize(payload);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const signature = signer.sign(ensurePrivateKey()).toString('base64');
  return { data, signature, payload };
}

export function verifySignedDaemonUploadGrant(data: string, signature: string): DaemonUploadGrantPayload {
  if (!data || !signature) throw new Error('Missing daemon upload authorization');
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(data);
  verifier.end();
  const ok = verifier.verify(ensurePublicKey(), Buffer.from(signature, 'base64'));
  if (!ok) throw new Error('Invalid daemon upload signature');
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error('Signed daemon upload payload is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Signed daemon upload payload is not an object');
  const payload = parsed as DaemonUploadGrantPayload;
  if (payload.version !== 1) throw new Error('Unsupported daemon upload payload version');
  if (typeof payload.projectId !== 'string' || payload.projectId.length === 0) throw new Error('Daemon upload payload missing projectId');
  if (!['audio', 'image', 'video', 'character-image'].includes(payload.kind)) throw new Error('Unsupported daemon upload kind');
  if (typeof payload.issuedAt !== 'string' || typeof payload.expiresAt !== 'string') throw new Error('Daemon upload payload missing timestamps');
  if (typeof payload.nonce !== 'string' || payload.nonce.length === 0) throw new Error('Daemon upload payload missing nonce');
  if (typeof payload.maxBytes !== 'number' || payload.maxBytes <= 0) throw new Error('Daemon upload payload missing maxBytes');
  if (!Array.isArray(payload.mimeTypes) || payload.mimeTypes.length === 0) throw new Error('Daemon upload payload missing mimeTypes');
  return payload;
}

export function assertDaemonUploadGrantFresh(payload: DaemonUploadGrantPayload) {
  const now = Date.now();
  const expires = Date.parse(payload.expiresAt);
  if (Number.isNaN(expires) || expires <= now) {
    throw new Error('Daemon upload grant expired');
  }
}

export function issueSignedMediaDownloadGrant(params: {
  path: string;
  userId: string;
  disposition?: 'attachment' | 'inline';
  ttlMs?: number;
}): SignedMediaDownloadGrant & { payload: MediaDownloadGrantPayload } {
  if (!params.path || params.path.trim().length === 0) throw new Error('Media download grant requires path');
  if (!params.userId || params.userId.trim().length === 0) throw new Error('Media download grant requires userId');
  const now = new Date();
  const ttl = params.ttlMs && params.ttlMs > 0 ? params.ttlMs : DEFAULT_TTL_MS;
  const expires = new Date(now.getTime() + ttl);
  const payload: MediaDownloadGrantPayload = {
    version: 1,
    path: params.path,
    userId: params.userId,
    disposition: params.disposition,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    nonce: Buffer.from(randomBytes(16)).toString('hex'),
  };
  const data = canonicalSerialize(payload);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const signature = signer.sign(ensurePrivateKey()).toString('base64');
  return { data, signature, payload };
}

export function verifySignedMediaDownloadGrant(data: string, signature: string): MediaDownloadGrantPayload {
  if (!data || !signature) throw new Error('Missing media download grant');
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(data);
  verifier.end();
  const ok = verifier.verify(ensurePublicKey(), Buffer.from(signature, 'base64'));
  if (!ok) throw new Error('Invalid media download signature');
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error('Signed media download payload is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Signed media download payload is not an object');
  const payload = parsed as MediaDownloadGrantPayload;
  if (payload.version !== 1) throw new Error('Unsupported media download payload version');
  if (typeof payload.path !== 'string' || payload.path.length === 0) throw new Error('Media download payload missing path');
  if (typeof payload.userId !== 'string' || payload.userId.length === 0) throw new Error('Media download payload missing userId');
  if (typeof payload.issuedAt !== 'string' || typeof payload.expiresAt !== 'string') throw new Error('Media download payload missing timestamps');
  if (typeof payload.nonce !== 'string' || payload.nonce.length === 0) throw new Error('Media download payload missing nonce');
  return payload;
}

export function assertMediaDownloadGrantFresh(payload: MediaDownloadGrantPayload) {
  const now = Date.now();
  const expires = Date.parse(payload.expiresAt);
  if (Number.isNaN(expires) || expires <= now) {
    throw new Error('Media download grant expired');
  }
}
