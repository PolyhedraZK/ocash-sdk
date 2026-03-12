import { getAddress, type Address } from 'viem';
import type { Hex } from '../types';
import { SdkError } from '../errors';
import { isHexStrict } from './hex';

/**
 * Require a strict hex string with 0x prefix.
 */
export const requireHex = (value: unknown, name: string): Hex => {
  if (isHexStrict(value, { minBytes: 1 })) return value;
  throw new SdkError('CONFIG', `${name} must be a hex string starting with 0x`);
};

/**
 * Require a finite number from unknown input.
 */
export const requireNumber = (value: unknown, name: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new SdkError('CONFIG', `${name} must be a finite number`);
};

/**
 * Require a valid EVM address from unknown input.
 */
export const requireAddress = (value: unknown, name: string): Address => {
  if (typeof value !== 'string') {
    throw new SdkError('CONFIG', `${name} must be a string address`);
  }
  return getAddress(value);
};

/**
 * Require a bigint-like value from unknown input.
 */
export const requireBigint = (value: unknown, name: string): bigint => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && value.length) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new SdkError('CONFIG', `${name} must be a bigint-compatible value`);
};
