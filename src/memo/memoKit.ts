import nacl from 'tweetnacl';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { keccak256, toBytes } from 'viem';
import { BabyJubjub, BABYJUBJUB_ORDER } from '../crypto/babyJubjub';
import type { CommitmentData } from '../types';
import { RecordCodec } from '../crypto/recordCodec';
import { randomBytes32Bigint } from '../utils/random';

const memoNonce = (ephemeralPublicKey: [bigint, bigint], userPublicKey: [bigint, bigint]): Uint8Array => {
  const revert = new Uint8Array(64);
  revert.set(BabyJubjub.compressPoint(ephemeralPublicKey), 0);
  revert.set(BabyJubjub.compressPoint(userPublicKey), 32);
  const hex = keccak256(revert);
  return toBytes(hex).slice(0, 24);
};

export class MemoKit {
  static createMemo(ro: CommitmentData): `0x${string}` {
    const messageHex = RecordCodec.encode(ro).slice(2);
    const message = hexToBytes(messageHex);

    const ephemeralSecretKey = randomBytes32Bigint(true) % BABYJUBJUB_ORDER;
    const ephemeralPublicKey = BabyJubjub.scalarMult(ephemeralSecretKey);
    const sharedPoint = BabyJubjub.mulPoint(ro.user_pk.user_address, ephemeralSecretKey);
    const sharedKey = BabyJubjub.compressPoint(sharedPoint);
    const nonce = memoNonce(ephemeralPublicKey, ro.user_pk.user_address);
    const ciphertext = nacl.secretbox(message, nonce, sharedKey);
    if (!ciphertext) throw new Error('Failed to encrypt memo');

    const sealed = new Uint8Array(32 + ciphertext.length);
    sealed.set(BabyJubjub.compressPoint(ephemeralPublicKey), 0);
    sealed.set(ciphertext, 32);
    return `0x${bytesToHex(sealed)}`;
  }

  static decryptMemo(secretKey: bigint, encoded: `0x${string}`): CommitmentData | null {
    const payload = hexToBytes(encoded.replace(/^0x/, ''));
    const bobPublicKey = BabyJubjub.scalarMult(secretKey);
    const ephemeralPublicKey = BabyJubjub.decompressPoint(payload.slice(0, 32));
    const ciphertext = payload.slice(32);
    const sharedPoint = BabyJubjub.mulPoint(ephemeralPublicKey, secretKey);
    const sharedKey = BabyJubjub.compressPoint(sharedPoint);
    const nonce = memoNonce(ephemeralPublicKey, bobPublicKey);
    try {
      const decrypted = nacl.secretbox.open(ciphertext, nonce, sharedKey);
      if (!decrypted) return null;
      const hexResult = bytesToHex(decrypted);
      return RecordCodec.decode(`0x${hexResult}`);
    } catch {
      return null;
    }
  }

  static memoNonce(ephemeralPublicKey: [bigint, bigint], userPublicKey: [bigint, bigint]): Uint8Array {
    return memoNonce(ephemeralPublicKey, userPublicKey);
  }
}
