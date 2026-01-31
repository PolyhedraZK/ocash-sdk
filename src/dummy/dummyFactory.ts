import type { CommitmentData, InputSecret, ProofBridge } from '../types';

export class DummyFactory {
  constructor(private readonly bridge: ProofBridge) {}

  async createRecordOpening(): Promise<CommitmentData> {
    return this.bridge.createDummyRecordOpening();
  }

  async createInputSecret(): Promise<InputSecret> {
    return this.bridge.createDummyInputSecret();
  }
}
