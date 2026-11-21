import { z } from 'zod';

const defaultShutdownDate = '2026-12-31';

export function isShutdownMode() {
  return ['1', 'true'].includes(process.env.SHUTDOWN_MODE?.trim().toLowerCase() ?? '');
}

export function getShutdownDate(): string | null {
  if (!isShutdownMode()) return null;
  const date = z.iso.date().safeParse(process.env.SHUTDOWN_DATE);
  return date.success ? date.data : defaultShutdownDate;
}

export class SignupsClosedError extends Error {
  constructor() {
    super('YumCut is no longer accepting new signups. Existing users can still sign in.');
  }
}

export function assertSignupsOpen() {
  if (isShutdownMode()) throw new SignupsClosedError();
}

export class PurchasesClosedError extends Error {
  constructor() {
    super('YumCut is no longer accepting new purchases.');
  }
}

export function assertPurchasesOpen() {
  if (isShutdownMode()) throw new PurchasesClosedError();
}
