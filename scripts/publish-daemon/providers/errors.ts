export type ProviderErrorCode =
  | 'quota_exceeded'
  | 'rate_limited'
  | 'transient_http_error'
  | 'network_error'
  | 'youtube_http_error'
  | 'storage_download_failed';

export type ProviderErrorDetails = Record<string, unknown>;

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly details?: ProviderErrorDetails;

  constructor(message: string, options: { code: ProviderErrorCode; retryable: boolean; details?: ProviderErrorDetails; cause?: unknown }) {
    super(message);
    this.name = 'ProviderError';
    this.code = options.code;
    this.retryable = options.retryable;
    if (options.details) {
      this.details = options.details;
    }
    if (options.cause !== undefined) {
      (this as any).cause = options.cause;
    }
  }
}

export function isProviderError(err: unknown): err is ProviderError {
  return err instanceof ProviderError;
}
