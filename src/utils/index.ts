import { serializeBigInt as serializeBigIntHelper } from './json';
import { randomBytes32 as coreRandomBytes32, randomBytes32Bigint } from './random';

const BASIS_POINTS = 10_000n;

export const calcDepositFee = (amount: bigint, feeBps?: number): bigint => {
  if (!feeBps) return 0n;
  return (amount * BigInt(feeBps)) / BASIS_POINTS;
};

export const randomBytes32 = () => coreRandomBytes32();

export const serializeBigInt = <T>(value: T): string => serializeBigIntHelper(value);

export const Utils = {
  calcDepositFee,
  randomBytes32,
  randomBytes32Bigint,
  serializeBigInt,
};
