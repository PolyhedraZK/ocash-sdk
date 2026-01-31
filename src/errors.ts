import type { SdkErrorCode, SdkErrorPayload } from './types';

export class SdkError extends Error implements SdkErrorPayload {
  code: SdkErrorCode;
  detail?: unknown;
  cause?: unknown;

  constructor(code: SdkErrorCode, message: string, detail?: unknown, cause?: unknown) {
    super(message);
    this.name = 'SdkError';
    this.code = code;
    this.detail = detail;
    this.cause = cause;
  }
}
