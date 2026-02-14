import { Hash, encodeAbiParameters, decodeAbiParameters, parseAbiParameters, toHex, toBytes } from 'viem';
import { CommitmentData } from '../types';
import { BabyJubjub } from './babyJubjub';

const ABI_PARAMETERS = parseAbiParameters('uint256, uint256, uint256, uint256, bool');

/**
 * Encode/decode record openings to ABI-compatible hex payloads.
 */
export class RecordCodec {
  /**
   * Encode a record opening into ABI-packed bytes.
   */
  static encode(ro: CommitmentData): Hash {
    const userAddressX = BigInt(ro.user_pk.user_address[0]);
    const userAddressY = BigInt(ro.user_pk.user_address[1]);

    if (!BabyJubjub.isOnCurve([userAddressX, userAddressY])) {
      throw new Error('Invalid BabyJubJub point');
    }

    const compressedPoint = BabyJubjub.compressPoint([userAddressX, userAddressY]);
    const compressedHex = toHex(compressedPoint);

    return encodeAbiParameters(ABI_PARAMETERS, [BigInt(ro.asset_id), BigInt(ro.asset_amount), BigInt(compressedHex), BigInt(ro.blinding_factor), ro.is_frozen]);
  }

  /**
   * Decode an ABI-packed record opening back into CommitmentData.
   */
  static decode(hexData: string): CommitmentData {
    if (!hexData) throw new Error('Missing record payload');
    const normalized = hexData.startsWith('0x') ? (hexData as Hash) : (`0x${hexData}` as Hash);
    const decoded = decodeAbiParameters(ABI_PARAMETERS, normalized) as readonly [bigint, bigint, bigint, bigint, boolean];
    // `decoded[2]` 是压缩后的 BabyJubjub 公钥，ABI 解析会去掉前导 0，需要重新补齐 32 字节
    const compressed = toBytes(decoded[2], { size: 32 });
    const [userX, userY] = BabyJubjub.decompressPoint(compressed);

    return {
      asset_id: decoded[0],
      asset_amount: decoded[1],
      user_pk: { user_address: [userX, userY] },
      blinding_factor: decoded[3],
      is_frozen: decoded[4],
    };
  }
}
