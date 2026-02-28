import type { CommitmentData, InputSecret, ProofBridge } from '../types';

/**
 * Wrapper around ProofBridge dummy helpers.
 */
export class DummyFactory {
  constructor(private readonly bridge: ProofBridge) {}

  /**
   * Create a dummy record opening via the WASM bridge.
   */
  async createRecordOpening(): Promise<CommitmentData> {
    return this.bridge.createDummyRecordOpening();
  }

  /**
   * Create a dummy input secret via the WASM bridge.
   */
  async createInputSecret(): Promise<InputSecret> {
    return this.bridge.createDummyInputSecret();
  }
}
