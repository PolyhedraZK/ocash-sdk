import { toHex } from 'viem';
import { BabyJubjub, BABYJUBJUB_ORDER } from './babyJubjub';
import type { CommitmentData, Hex } from '../types';
import { Poseidon2, Poseidon2Domain } from './poseidon2';
import { randomBytes32Bigint } from '../utils/random';

export class CryptoToolkit {
  static commitment(record: CommitmentData, format: 'hex'): Hex;
  static commitment(record: CommitmentData, format: 'bigint'): bigint;
  static commitment(record: CommitmentData, format?: 'hex' | 'bigint'): Hex | bigint {
    let amount = BigInt(record.asset_amount);
    if (record.is_frozen) {
      amount |= 1n << 128n;
    }
    const elements = [BigInt(record.user_pk.user_address[0]), BigInt(record.user_pk.user_address[1]), BigInt(record.blinding_factor), BigInt(record.asset_id), amount];
    const h = Poseidon2.hashSequenceWithDomain(elements, Poseidon2Domain.Record);
    const hex = toHex(h, { size: 32 });
    return format === 'bigint' ? BigInt(hex) : hex;
  }

  static nullifier(secretKey: bigint, commitment: `0x${string}`, freezerPk?: [bigint, bigint]): `0x${string}` {
    let nullifierKey: bigint;
    const defaultFreezer = !freezerPk || (freezerPk[0] === 0n && freezerPk[1] === 1n);
    if (defaultFreezer) {
      nullifierKey = secretKey;
    } else {
      if (!BabyJubjub.isOnCurve(freezerPk!)) {
        throw new Error('Freezer public key is not on BabyJubjub curve');
      }
      const shared = BabyJubjub.mulPoint(freezerPk!, secretKey);
      nullifierKey = Poseidon2.hashDomain(shared[0], shared[1], Poseidon2Domain.KeyDerivation);
    }

    const n = Poseidon2.hashDomain(nullifierKey, BigInt(commitment), Poseidon2Domain.Nullifier);
    return toHex(n, { size: 32 });
  }

  static createRecordOpening(input: {
    asset_id: bigint | number | string;
    asset_amount: bigint | number | string;
    user_pk: { user_address: [bigint | number | string, bigint | number | string] };
    blinding_factor?: bigint | number | string;
    is_frozen?: boolean;
  }): CommitmentData {
    const hasCustomBlinding = input.blinding_factor !== undefined;
    const attempts = hasCustomBlinding ? 1 : 5;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const blinding = hasCustomBlinding && attempt === 0 ? BigInt(input.blinding_factor!) : randomBytes32Bigint(true);
      const record: CommitmentData = {
        asset_id: BigInt(input.asset_id),
        asset_amount: BigInt(input.asset_amount),
        user_pk: {
          user_address: [BigInt(input.user_pk.user_address[0]), BigInt(input.user_pk.user_address[1])],
        },
        blinding_factor: blinding,
        is_frozen: Boolean(input.is_frozen),
      };
      if (hasCustomBlinding) return record;
      const commitment = Poseidon2.hashSequenceWithDomain(
        [record.user_pk.user_address[0], record.user_pk.user_address[1], record.blinding_factor, record.asset_id, record.asset_amount],
        Poseidon2Domain.Record,
      );
      if (commitment !== 0n) {
        return record;
      }
    }
    throw new Error('Failed to derive non-zero commitment');
  }

  static viewingRandomness(): Uint8Array {
    const scalar = randomBytes32Bigint(true) % BABYJUBJUB_ORDER;
    const buf = new Uint8Array(32);
    const hex = scalar.toString(16).padStart(64, '0');
    for (let i = 0; i < 32; i++) {
      buf[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return buf;
  }

  static poolId(tokenAddress: Hex | bigint | number | string, viewerPk: [bigint, bigint], freezerPk: [bigint, bigint]): bigint {
    const inputs = [BigInt(viewerPk[0]), BigInt(viewerPk[1]), BigInt(freezerPk[0]), BigInt(freezerPk[1])];
    const seed = typeof tokenAddress === 'bigint' ? tokenAddress : BigInt(tokenAddress);
    return Poseidon2.hashSequenceWithDomain(inputs, Poseidon2Domain.Policy, seed);
  }
}
