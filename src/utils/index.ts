import { serializeBigInt as serializeBigIntHelper } from './json';
import { randomBytes32 as coreRandomBytes32, randomBytes32Bigint } from './random';

const BASIS_POINTS = 10_000n;

/**
 * Calculate protocol fee from amount and basis points.
 */
export const calcDepositFee = (amount: bigint, feeBps?: number): bigint => {
  if (!feeBps) return 0n;
  return (amount * BigInt(feeBps)) / BASIS_POINTS;
};

/**
 * Secure random bytes (32).
 */
export const randomBytes32 = () => coreRandomBytes32();

/**
 * Serialize bigint values to JSON-friendly strings.
 */
export const serializeBigInt = <T>(value: T): string => serializeBigIntHelper(value);

/**
 * Convenience namespace for commonly used utils.
 */
export const Utils = {
  calcDepositFee,
  randomBytes32,
  randomBytes32Bigint,
  serializeBigInt,
};
