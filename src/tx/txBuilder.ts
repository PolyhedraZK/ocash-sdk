import type { ProofResult, RelayerRequest, TxBuilderApi } from '../types';
import { SdkError } from '../errors';
import { requireHex, requireNumber, requireAddress, requireBigint } from '../utils/validators';

/**
 * Build relayer request payloads from proof results.
 */
export class TxBuilder implements TxBuilderApi {
  /**
   * Build relayer request for transfer proofs.
   */
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

  /**
   * Build relayer request for withdraw proofs.
   */
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
