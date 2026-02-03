import type { ProofResult, RelayerRequest, TxBuilderApi } from '../types';
import { TxBuilder } from './txBuilder';

export class TxBuilderStub implements TxBuilderApi {
  private readonly impl = new TxBuilder();

  async buildTransferCalldata(input: { chainId: number; proof: ProofResult }): Promise<RelayerRequest> {
    return this.impl.buildTransferCalldata(input);
  }

  async buildWithdrawCalldata(input: { chainId: number; proof: ProofResult }): Promise<RelayerRequest> {
    return this.impl.buildWithdrawCalldata(input);
  }
}
