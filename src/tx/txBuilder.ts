import type { ProofResult, RelayerRequest, TxBuilderApi } from '../types';
import { SdkError } from '../errors';
import { getAddress, type Address } from 'viem';
import { isHexStrict } from '../utils/hex';

const requireNumber = (value: unknown, name: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new SdkError('CONFIG', `Missing ${name}`);
};

const requireHex = (value: unknown, name: string): `0x${string}` => {
  if (isHexStrict(value, { minBytes: 1 })) return value as `0x${string}`;
  throw new SdkError('CONFIG', `Missing ${name}`);
};

const requireAddress = (value: unknown, name: string): Address => {
  if (typeof value !== 'string') {
    throw new SdkError('CONFIG', `Missing ${name}`);
  }
  return getAddress(value);
};

const requireBigint = (value: unknown, name: string): bigint => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && value.length) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new SdkError('CONFIG', `Missing ${name}`);
};

export class TxBuilder implements TxBuilderApi {
  async buildTransferCalldata(input: { chainId: number; proof: ProofResult }): Promise<RelayerRequest> {
    const proof = input.proof;
    const arrayHashIndex = requireNumber(proof.array_hash_index, 'array_hash_index');
    const merkleRootIndex = requireNumber(proof.merkle_root_index, 'merkle_root_index');
    const relayer = requireAddress(proof.relayer, 'relayer');

    const extraData = proof.extra_data;
    if (!Array.isArray(extraData) || extraData.length !== 3) {
      throw new SdkError('CONFIG', 'Transfer requires extra_data as bytes[3]');
    }
    extraData.forEach((entry, idx) => requireHex(entry, `extra_data[${idx}]`));

    const request: RelayerRequest = {
      kind: 'relayer',
      method: 'POST',
      path: '/api/v1/transfer',
      body: {
        proof: proof.proof,
        input: proof.public_input,
        extra_data: extraData,
        merkle_root_index: merkleRootIndex,
        array_hash_index: arrayHashIndex,
        relayer,
        flatten_input: proof.flatten_input,
      },
    };

    return request;
  }

  async buildWithdrawCalldata(input: { chainId: number; proof: ProofResult }): Promise<RelayerRequest> {
    const proof = input.proof;
    const arrayHashIndex = requireNumber(proof.array_hash_index, 'array_hash_index');
    const merkleRootIndex = requireNumber(proof.merkle_root_index, 'merkle_root_index');
    const relayer = requireAddress(proof.relayer, 'relayer');
    const recipientAddress = requireAddress(proof.recipient, 'recipient');

    const relayerFee = requireBigint(proof.relayer_fee, 'relayer_fee');
    const gasDropValue = requireBigint(proof.gas_drop_value ?? 0n, 'gas_drop_value');

    const burnAmount = requireBigint(proof.withdraw_amount, 'withdraw_amount (burn_amount)');

    const extraData = proof.extra_data;
    if (Array.isArray(extraData)) {
      throw new SdkError('CONFIG', 'Withdraw requires extra_data as bytes');
    }
    const extraDataHex = requireHex(extraData, 'extra_data');

    const request: RelayerRequest = {
      kind: 'relayer',
      method: 'POST',
      path: '/api/v1/burn',
      body: {
        proof: proof.proof,
        input: proof.public_input,
        extra_data: extraDataHex,
        merkle_root_index: merkleRootIndex,
        array_hash_index: arrayHashIndex,
        recipient_address: recipientAddress,
        relayer,
        relayer_fee: relayerFee.toString(),
        gas_drop_value: gasDropValue.toString(),
        burn_amount: burnAmount.toString(),
        flatten_input: proof.flatten_input,
      },
    };

    return request;
  }
}
