import type { Hex } from '../types';

/**
 * Strict `0x`-prefixed hex string validation.
 * - Only hex chars [0-9a-fA-F]
 * - Even-length payload (whole bytes)
 * - Optional minimum payload length (in bytes)
 */
export const isHexStrict = (value: unknown, options?: { minBytes?: number }): value is Hex => {
  if (typeof value !== 'string') return false;
  if (!/^0x[0-9a-fA-F]*$/.test(value)) return false;
  if (value.length % 2 !== 0) return false;
  const payloadChars = value.length - 2;
  if (payloadChars <= 0) return false;
  const minBytes = options?.minBytes;
  if (minBytes != null && Number.isFinite(minBytes)) {
    const minChars = Math.max(0, Math.floor(minBytes)) * 2;
    if (payloadChars < minChars) return false;
  }
  return true;
};

