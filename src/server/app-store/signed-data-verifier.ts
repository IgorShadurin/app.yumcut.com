import fs from 'node:fs';
import path from 'node:path';
import { SignedDataVerifier, Environment, JWSTransactionDecodedPayload } from '@apple/app-store-server-library';
import { config } from '@/server/config';

let verifier: SignedDataVerifier | null = null;

const ROOT_CERT_FILES = [
  path.resolve(process.cwd(), 'keys/AppleRootCA-G3.cer'),
  path.resolve(process.cwd(), 'keys/AppleWorldwideDeveloperRelationsCA-G4.cer'),
];

function loadRootCertificates(): Buffer[] {
  const buffers = ROOT_CERT_FILES.filter((filePath) => fs.existsSync(filePath)).map((filePath) => fs.readFileSync(filePath));
  if (buffers.length === 0) {
    throw new Error('Apple root certificates are missing. Add them under keys/ and redeploy.');
  }
  return buffers;
}

function resolveEnvironment() {
  return (config.APPLE_IAP_ENVIRONMENT ?? 'sandbox') === 'production'
    ? Environment.PRODUCTION
    : Environment.SANDBOX;
}

function getVerifier(): SignedDataVerifier {
  if (verifier) return verifier;
  const bundleId = config.APPLE_IOS_CLIENT_ID;
  if (!bundleId) {
    throw new Error('APPLE_IOS_CLIENT_ID must be configured to verify signed StoreKit transactions.');
  }
  const environment = resolveEnvironment();
  const appAppleId = config.APPLE_APP_APPLE_ID;
  if (environment === Environment.PRODUCTION && !appAppleId) {
    throw new Error('APPLE_APP_APPLE_ID must be configured when APPLE_IAP_ENVIRONMENT=production to verify signed StoreKit transactions.');
  }
  const roots = loadRootCertificates();
  verifier = new SignedDataVerifier(roots, true, environment, bundleId, appAppleId);
  return verifier;
}

export async function decodeSignedTransactionPayload(payload: string): Promise<JWSTransactionDecodedPayload> {
  const instance = getVerifier();
  return instance.verifyAndDecodeTransaction(payload);
}
