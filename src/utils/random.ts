import { bytesToHex } from '@noble/hashes/utils';
import { BN254_FIELD_MODULUS } from '../crypto/field';

/**
 * Read cryptographically secure random bytes from global crypto.
 */
const getRandomBytes = (size: number): Uint8Array => {
  if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('Secure random generator is not available in this environment');
  }
  const array = new Uint8Array(size);
  globalThis.crypto.getRandomValues(array);
  return array;
};

/**
 * 32-byte random buffer.
 */
export const randomBytes32 = (): Uint8Array => getRandomBytes(32);

/**
 * 生成 32 字节随机数，并根据需要截断为 BN254 有限域元素
 */
export const randomBytes32Bigint = (isBabyJubScalar = false): bigint => {
  const buf = getRandomBytes(32);
  let result = BigInt(`0x${bytesToHex(buf)}`);
  if (isBabyJubScalar) {
    result %= BN254_FIELD_MODULUS;
  }
  return result;
};
