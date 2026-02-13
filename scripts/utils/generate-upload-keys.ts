#!/usr/bin/env tsx
import { promises as fs } from 'fs';
import path from 'path';
import { generateKeyPairSync } from 'node:crypto';

async function main() {
  const outputDir = path.resolve(process.cwd(), 'keys');
  await fs.mkdir(outputDir, { recursive: true });

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'pkcs1',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs1',
      format: 'pem',
    },
  });

  const privatePath = path.join(outputDir, 'upload_private.pem');
  const publicPath = path.join(outputDir, 'upload_public.pem');

  await fs.writeFile(privatePath, privateKey, { encoding: 'utf8', mode: 0o600 });
  await fs.writeFile(publicPath, publicKey, { encoding: 'utf8', mode: 0o600 });

  // eslint-disable-next-line no-console
  console.log('✔ Generated RSA key pair for upload signing.');
  // eslint-disable-next-line no-console
  console.log('  Private key :', privatePath);
  // eslint-disable-next-line no-console
  console.log('  Public key  :', publicPath);
  // eslint-disable-next-line no-console
  console.log('\nNext steps:');
  // eslint-disable-next-line no-console
  console.log('  • App deployment (APP_MODE=full):');
  // eslint-disable-next-line no-console
  console.log(`      export UPLOAD_SIGNING_PRIVATE_KEY="$(cat ${privatePath})"`);
  // eslint-disable-next-line no-console
  console.log(`      export UPLOAD_SIGNING_PUBLIC_KEY="$(cat ${publicPath})"`);
  // eslint-disable-next-line no-console
  console.log('  • Storage deployment (APP_MODE=storage):');
  // eslint-disable-next-line no-console
  console.log(`      export UPLOAD_SIGNING_PUBLIC_KEY="$(cat ${publicPath})"`);
  // eslint-disable-next-line no-console
  console.log('\nKeep the private key secret; commit neither file.');
}

void main().catch((err) => {
  console.error('Failed to generate upload keys');
  console.error(err);
  process.exit(1);
});
