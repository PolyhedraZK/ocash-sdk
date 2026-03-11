import type { ChairmanMerkleNodeRecord, ChairmanMerkleVersionRecord, EntryMemoRecord, EntryNullifierRecord, Hex } from '../../types';
import type { PersistedWalletState } from './persistedWalletState';
import type { StoredOperation } from './operationTypes';

export type PersistedStoreState = {
  wallet: PersistedWalletState;
  operations: StoredOperation[];
};

export type PersistedSharedState = {
  /**
   * Optional persisted merkle leaves per chain.
   *
   * Note: This can grow large over time. Implementations may choose to persist
   * it separately (e.g. FileStore uses a jsonl file), but the in-memory stores
   * and simple JSON-backed stores can store it here.
   */
  merkleLeaves?: Record<string, Array<{ cid: number; commitment: Hex }>>;

  /**
   * Optional raw EntryService memo cache, keyed by chainId.
   */
  entryMemos?: Record<string, EntryMemoRecord[]>;

  /**
   * Optional raw EntryService nullifier cache, keyed by chainId.
   */
  entryNullifiers?: Record<string, EntryNullifierRecord[]>;

  /**
   * Optional chairmanMerkle tree version cache, keyed by chainId -> version.
   */
  chairmanMerkleVersions?: Record<string, Record<number, ChairmanMerkleVersionRecord>>;

  /**
   * Optional chairmanMerkle tree node cache, keyed by chainId -> nodeId.
   * Used for fast local proof generation.
   */
  chairmanMerkleNodes?: Record<string, Record<string, ChairmanMerkleNodeRecord>>;
};
