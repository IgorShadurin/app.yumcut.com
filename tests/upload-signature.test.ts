import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

// eslint-disable-next-line import/no-named-as-default
import {
  issueSignedUploadGrant,
  verifySignedUploadGrant,
  assertUploadGrantFresh,
  issueSignedStorageCommand,
  verifySignedStorageCommand,
  assertStorageCommandFresh,
} from '@/lib/upload-signature';

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  process.env.UPLOAD_SIGNING_PRIVATE_KEY = privateKey;
  process.env.UPLOAD_SIGNING_PUBLIC_KEY = publicKey;
});

describe('upload signature helpers', () => {
  it('issues and verifies a grant', () => {
    const grant = issueSignedUploadGrant({ userId: 'user-123', purpose: 'user-character-image' });
    const payload = verifySignedUploadGrant(grant.data, grant.signature);
    expect(payload.userId).toBe('user-123');
    expect(payload.purpose).toBe('user-character-image');
    expect(payload.mimeTypes).toContain('image/png');
    expect(() => assertUploadGrantFresh(payload)).not.toThrow();
  });

  it('rejects tampered data', () => {
    const grant = issueSignedUploadGrant({ userId: 'user-123', purpose: 'user-character-image' });
    const tampered = grant.data.replace('user-123', 'user-evil');
    expect(() => verifySignedUploadGrant(tampered, grant.signature)).toThrow('Invalid upload signature');
  });

  it('rejects expired grant', () => {
    const grant = issueSignedUploadGrant({ userId: 'user-123', purpose: 'user-character-image', ttlMs: 1 });
    const payload = verifySignedUploadGrant(grant.data, grant.signature);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(() => assertUploadGrantFresh(payload)).toThrow('Upload grant expired');
        resolve();
      }, 5);
    });
  });
});

describe('storage command signature helpers', () => {
  it('issues and verifies a delete command', () => {
    const command = issueSignedStorageCommand({ type: 'delete-character-image', userId: 'user-123', path: 'characters/2025/09/file.png' });
    const payload = verifySignedStorageCommand(command.data, command.signature);
    expect(payload.type).toBe('delete-character-image');
    expect(payload.userId).toBe('user-123');
    expect(payload.path).toBe('characters/2025/09/file.png');
    expect(() => assertStorageCommandFresh(payload)).not.toThrow();
  });

  it('rejects tampered commands', () => {
    const command = issueSignedStorageCommand({ type: 'delete-character-image', userId: 'user-123', path: 'characters/2025/09/file.png' });
    const tampered = command.data.replace('file.png', 'file-evil.png');
    expect(() => verifySignedStorageCommand(tampered, command.signature)).toThrow('Invalid storage command signature');
  });

  it('supports multi-path delete commands', () => {
    const command = issueSignedStorageCommand({
      type: 'delete-user-media',
      userId: 'user-456',
      paths: ['audio/foo.wav', 'video/bar.mp4', 'audio/foo.wav'],
    });
    const payload = verifySignedStorageCommand(command.data, command.signature);
    expect(payload.type).toBe('delete-user-media');
    expect(payload.paths).toEqual(['audio/foo.wav', 'video/bar.mp4']);
  });

  it('rejects expired commands', () => {
    const command = issueSignedStorageCommand({ type: 'delete-character-image', userId: 'user-123', path: 'characters/2025/09/file.png', ttlMs: 1 });
    const payload = verifySignedStorageCommand(command.data, command.signature);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(() => assertStorageCommandFresh(payload)).toThrow('Storage command expired');
        resolve();
      }, 5);
    });
  });
});
