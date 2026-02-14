import type { ProofResult, RelayerRequest, TxBuilderApi } from '../types';
import { TxBuilder } from './txBuilder';

/**
 * Thin wrapper for environments that require a stable TxBuilder instance.
 */
export class TxBuilderStub implements TxBuilderApi {
  private readonly impl = new TxBuilder();

  /**
   * Forward transfer calldata build to the concrete TxBuilder.
   */
  async buildTransferCalldata(input: { chainId: number; proof: ProofResult }): Promise<RelayerRequest> {
    return this.impl.buildTransferCalldata(input);
  }

  /**
   * Forward withdraw calldata build to the concrete TxBuilder.
   */
  async buildWithdrawCalldata(input: { chainId: number; proof: ProofResult }): Promise<RelayerRequest> {
    return this.impl.buildWithdrawCalldata(input);
  }
}
