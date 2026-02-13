const HANDLED_ERROR = Symbol('daemonHandledError');

export function createHandledError(message: string, cause?: unknown): Error {
  const error = cause instanceof Error ? new Error(message, { cause }) : new Error(message);
  (error as any)[HANDLED_ERROR] = true;
  return error;
}

export function isHandledError(error: unknown): boolean {
  return !!(error && typeof error === 'object' && (error as any)[HANDLED_ERROR]);
}
