import type { ProofBridge, ProofResult, TransferWitnessInput, WitnessBuildResult, WitnessContext, WithdrawWitnessInput } from '../types';
import { bigintReplacer } from '../utils/json';
import type { SdkEvent } from '../types';
import { SdkCore } from '../core/sdk-core';

export class ProofEngine {
  constructor(
    private readonly bridge: ProofBridge,
    private readonly core: SdkCore,
  ) {}

  async createWitnessTransfer(input: TransferWitnessInput, context: WitnessContext = {}): Promise<WitnessBuildResult> {
    return this.composeBuildResult('transfer', input, context);
  }

  async createWitnessWithdraw(input: WithdrawWitnessInput, context: WitnessContext = {}): Promise<WitnessBuildResult> {
    return this.composeBuildResult('withdraw', input, context);
  }

  async proveTransfer(witness: TransferWitnessInput | string, context: WitnessContext = {}): Promise<ProofResult> {
    return this.prove('transfer', witness, context);
  }

  async proveWithdraw(witness: WithdrawWitnessInput | string, context: WitnessContext = {}): Promise<ProofResult> {
    return this.prove('withdraw', witness, context);
  }

  private composeBuildResult(type: 'transfer' | 'withdraw', witness: TransferWitnessInput | WithdrawWitnessInput, context: WitnessContext): WitnessBuildResult {
    return {
      witness,
      witness_type: type,
      array_hash_index: context.array_hash_index,
      merkle_root_index: context.merkle_root_index,
      relayer: context.relayer,
      extra_data: context.extra_data,
      relayer_fee: context.relayer_fee,
      gas_drop_value: context.gas_drop_value,
      array_hash_digest: context.array_hash_digest,
    };
  }

  private async prove(type: 'transfer' | 'withdraw', witness: TransferWitnessInput | WithdrawWitnessInput | string, context: WitnessContext): Promise<ProofResult> {
    const payload = typeof witness === 'string' ? witness : JSON.stringify(witness, bigintReplacer);
    this.emit({ type: 'zkp:start', payload: { circuit: type } });
    const startedAt = Date.now();
    try {
      const raw = type === 'transfer' ? await this.bridge.proveTransfer(payload) : await this.bridge.proveWithdraw(payload);
      const parsed = JSON.parse(raw);
      if (!parsed.success) {
        throw new Error(parsed.err || `prove${type === 'transfer' ? 'Transfer' : 'Withdraw'} failed`);
      }
      const publicInput = parsed.input ?? parsed.public_input;
      const result: ProofResult = {
        proof: parsed.proof,
        flatten_input: parsed.flatten_input,
        public_input: publicInput,
        array_hash_index: parsed.array_hash_index ?? context.array_hash_index,
        merkle_root_index: parsed.merkle_root_index ?? context.merkle_root_index,
        relayer: parsed.relayer ?? context.relayer,
        recipient: parsed.recipient ?? context.recipient,
        withdraw_amount: parsed.withdraw_amount ? BigInt(parsed.withdraw_amount) : context.withdraw_amount,
        extra_data: parsed.extra_data ?? context.extra_data,
        relayer_fee: parsed.relayer_fee ? BigInt(parsed.relayer_fee) : context.relayer_fee,
        gas_drop_value: parsed.gas_drop_value ? BigInt(parsed.gas_drop_value) : context.gas_drop_value,
        array_hash_digest: parsed.array_hash_digest ?? context.array_hash_digest,
        gnark_output: parsed.gnark_output,
        witness_json: parsed.witness_json,
        err: parsed.err ?? null,
        warnings: parsed.warnings,
      };
      const elapsed = Date.now() - startedAt;
      this.emit({
        type: 'zkp:done',
        payload: {
          circuit: type,
          costMs: elapsed,
        },
      });
      return result;
    } catch (error) {
      this.emit({
        type: 'error',
        payload: {
          code: 'PROOF',
          message: error instanceof Error ? error.message : 'Proof failed',
          detail: { circuit: type },
          cause: error,
        },
      });
      throw error;
    }
  }

  private emit(event: SdkEvent) {
    this.core.emit(event);
  }
}
