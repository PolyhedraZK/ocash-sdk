import type { SdkErrorCode } from '../types';
import { SdkError } from '../errors';

export const toBigintOrThrow = (
  value: unknown,
  input: { code: SdkErrorCode; name: string; detail: Record<string, unknown> },
): bigint => {
  if (typeof value === 'bigint') return value;
  try {
    if (typeof value === 'string' && value.length) return BigInt(value);
    if (typeof value === 'number' && Number.isFinite(value)) return BigInt(value);
    return BigInt(value as any);
  } catch (error) {
    throw new SdkError(input.code, `Invalid ${input.name}`, { ...input.detail, value }, error);
  }
};
