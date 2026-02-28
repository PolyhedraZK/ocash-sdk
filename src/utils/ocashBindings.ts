import { encodeAbiParameters, getAddress, keccak256 } from 'viem';
import { BABYJUBJUB_SCALAR_FIELD } from '../crypto/babyJubjub';
import type { TransferExtraData, Hex } from '../types';

/**
 * Compute the proof binding for transfer proofs (relayer + extra data).
 */
export function calcTransferProofBinding(input: { relayer: string; extraData: TransferExtraData }) {
  const encodedExtra = encodeAbiParameters([{ type: 'bytes[3]' }], [input.extraData]);
  const packed = encodeAbiParameters([{ type: 'address' }, { type: 'bytes' }], [getAddress(input.relayer), encodedExtra]);
  return BigInt(keccak256(packed)) % BABYJUBJUB_SCALAR_FIELD;
}

/**
 * Compute the proof binding for withdraw proofs (relayer + recipient + fees).
 */
export function calcWithdrawProofBinding(input: {
  recipient: string;
  amount: bigint;
  relayer: string;
  relayerFee: bigint;
  gasDropValue: bigint;
  extraData: Hex;
}) {
  const packed = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint128' }, { type: 'address' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'bytes' }],
    [getAddress(input.recipient), input.amount, getAddress(input.relayer), input.relayerFee, input.gasDropValue, input.extraData],
  );
  return BigInt(keccak256(packed)) % BABYJUBJUB_SCALAR_FIELD;
}
