import type { SdkErrorCode, SdkErrorPayload } from './types';

/**
 * Typed SDK error with code, detail, and cause fields.
 */
export class SdkError extends Error implements SdkErrorPayload {
  code: SdkErrorCode;
  detail?: unknown;
  cause?: unknown;

  /**
   * Create a new SdkError with optional detail/cause.
   */
  constructor(code: SdkErrorCode, message: string, detail?: unknown, cause?: unknown) {
    super(message);
    this.name = 'SdkError';
    this.code = code;
    this.detail = detail;
    this.cause = cause;
  }
}
