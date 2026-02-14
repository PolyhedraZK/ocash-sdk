import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { BabyJubjub, createKeyPairFromSeed, validateKeyPair } from './babyJubjub';
import type { Hex, UserKeyPair, UserPublicKey, UserSecretKey } from '../types';
import { toHex } from 'viem';

const HKDF_INFO = 'OCash.KeyGen';

/**
 * Derive a 32-byte seed from a human string using HKDF-SHA256.
 */
const deriveSeed = (seed: string, nonce?: string): `0x${string}` => {
  if (seed.length < 16) throw new Error('Seed must be at least 16 characters');
  const ikm = utf8ToBytes(seed);
  const info = utf8ToBytes(nonce ? `${HKDF_INFO}:${nonce}` : HKDF_INFO);
  const okm = hkdf(sha256, ikm, undefined, info, 32);
  return `0x${bytesToHex(okm)}`;
};

/**
 * Derive a BabyJubjub keypair from a seed and optional nonce.
 */
const seedToKeyPair = (seed: string, nonce?: string): UserKeyPair => {
  const derivedSeed = deriveSeed(seed, nonce);
  const keyPair = createKeyPairFromSeed(derivedSeed);
  if (!validateKeyPair(keyPair)) {
    throw new Error('Generated key pair validation failed');
  }
  return keyPair;
};

/**
 * Key derivation and address conversion utilities.
 */
export class KeyManager {
  /**
   * Derive a full keypair from seed and optional nonce.
   */
  static deriveKeyPair(seed: string, nonce?: string): UserKeyPair {
    return seedToKeyPair(seed, nonce);
  }

  /**
   * Derive public key only from seed (no secret exposure).
   */
  static getPublicKeyBySeed(seed: string, nonce?: string): UserPublicKey {
    const keyPair = seedToKeyPair(seed, nonce);
    return { user_pk: keyPair.user_pk };
  }

  /**
   * Derive secret key object from seed (includes public key).
   */
  static getSecretKeyBySeed(seed: string, nonce?: string): UserSecretKey {
    return seedToKeyPair(seed, nonce);
  }

  /**
   * Compress BabyJubjub public key into an OCash viewing address.
   */
  static userPkToAddress(userPk: { user_address: [bigint | string, bigint | string] }): Hex {
    const x = BigInt(userPk.user_address[0]);
    const y = BigInt(userPk.user_address[1]);
    if (!BabyJubjub.isOnCurve([x, y])) {
      throw new Error('Invalid elliptic curve point');
    }
    const compressed = BabyJubjub.compressPoint([x, y]);
    return toHex(compressed);
  }

  /**
   * Decompress an OCash viewing address back to BabyJubjub public key.
   */
  static addressToUserPk(address: Hex): { user_address: [bigint, bigint] } {
    const payload = address.startsWith('0x') ? address.slice(2) : address;
    const bytes = hexToBytes(payload);
    const point = BabyJubjub.decompressPoint(bytes);
    if (!BabyJubjub.isOnCurve(point)) {
      throw new Error('Invalid OCash address');
    }
    return { user_address: [point[0], point[1]] };
  }
}
