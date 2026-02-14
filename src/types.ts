import type { Address, PublicClient } from 'viem';
import type { ListOperationsQuery, OperationCreateInput, OperationDetailFor, OperationType, StoredOperation } from './store/operationTypes';
export type { ListOperationsQuery, OperationCreateInput, OperationDetailFor, OperationType, StoredOperation } from './store/operationTypes';

/** Hex-encoded bytes with 0x prefix. */
export type Hex = `0x${string}`;
/** Decimal string representing a bigint value. */
export type BigintLikeString = string;
/** viem transaction receipt type alias. */
export type TransactionReceipt = Awaited<ReturnType<PublicClient['waitForTransactionReceipt']>>;

/** SDK error code namespaces. */
export type SdkErrorCode = 'CONFIG' | 'ASSETS' | 'STORAGE' | 'SYNC' | 'CRYPTO' | 'MERKLE' | 'WITNESS' | 'PROOF' | 'RELAYER';

/** Token configuration for a shielded pool. */
export interface TokenMetadata {
  id: string;
  symbol: string;
  decimals: number;
  wrappedErc20: Address;
  viewerPk: [string, string];
  freezerPk: [string, string];
  depositFeeBps?: number;
  withdrawFeeBps?: number;
  transferMaxAmount?: bigint | string;
  withdrawMaxAmount?: bigint | string;
}

/** Chain configuration input for SDK initialization. */
export interface ChainConfigInput {
  chainId: number;
  rpcUrl?: string;
  entryUrl?: string;
  ocashContractAddress?: Address;
  relayerUrl?: string;
  merkleProofUrl?: string;
  tokens?: TokenMetadata[];

  /**
   * Legacy fields: kept for compatibility with existing code/tests.
   * Prefer `ocashContractAddress`.
   */
  contract?: Address;
}

/** Relayer fee entry for a specific pool. */
export interface RelayerFeeEntry {
  token_address: Hex;
  fee: bigint;
}

/** Relayer fee tables for transfer/withdraw actions. */
export interface RelayerFeeConfigure {
  valid_time: number;
  transfer: Record<string, RelayerFeeEntry>;
  withdraw: Record<string, RelayerFeeEntry>;
}

/** Relayer configuration fetched from relayer service. */
export interface RelayerConfig {
  config: {
    contract_address: Address;
    chain_id: number;
    name: string;
    relayer_address: Address;
    img_url?: string;
    submit_timeout?: number;
  };
  fee_configure: RelayerFeeConfigure;
  fetched_at?: number;
}

/** Worker configuration for memo decryption. */
export interface MemoWorkerConfig {
  workerUrl?: string;
  concurrency?: number;
  type?: 'classic' | 'module';
}

/** Asset override entry: URL/path or sharded list. */
export type AssetOverrideEntry = string | string[];

/** Map of required runtime assets to URLs/paths. */
export interface AssetsOverride {
  [filename: string]: AssetOverrideEntry;
}

/** SDK configuration passed to {@link createSdk}. */
/** SDK configuration passed to createSdk(). */
export interface OCashSdkConfig {
  chains: ChainConfigInput[];
  assetsOverride?: AssetsOverride;
  memoWorker?: MemoWorkerConfig;
  cacheDir?: string;
  runtime?: 'auto' | 'browser' | 'node' | 'hybrid';
  storage?: StorageAdapter;
  merkle?: {
    /**
     * `remote`: always use `chain.merkleProofUrl`.
     * `local`: always use locally built merkle (requires feeding all leaves).
     * `hybrid`: prefer local, fallback to remote if missing.
     */
    mode?: 'remote' | 'local' | 'hybrid';
    /**
     * Merkle depth used by the on-chain tree (defaults to 32).
     */
    treeDepth?: number;
  };
  sync?: {
    pageSize?: number;
    pollMs?: number;
    requestTimeoutMs?: number;
    /**
     * Optional network retry policy for sync requests (Entry/Merkle).
     * Defaults to no retries.
     */
    retry?: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number };
  };
  onEvent?: (event: SdkEvent) => void;
}

/** Serialized error payload used in events. */
export interface SdkErrorPayload {
  code: SdkErrorCode;
  message: string;
  detail?: unknown;
  cause?: unknown;
}

/** Union of all SDK event payloads. */
export type SdkEvent =
  | { type: 'core:ready'; payload: { assetsVersion: string; durationMs: number } }
  | { type: 'core:progress'; payload: { stage: 'fetch' | 'compile' | 'init'; loaded: number; total?: number } }
  | { type: 'sync:start'; payload: { chainId: number; source: 'entry' | 'rpc' | 'subgraph' } }
  | { type: 'sync:progress'; payload: { chainId: number; resource: 'memo' | 'nullifier' | 'merkle'; downloaded: number; total?: number } }
  | { type: 'sync:done'; payload: { chainId: number; cursor: SyncCursor } }
  | { type: 'debug'; payload: { scope: string; message: string; detail?: unknown } }
  | {
      type: 'operations:update';
      payload: {
        action: 'create' | 'update';
        operationId?: string;
        patch?: Partial<StoredOperation>;
        operation?: StoredOperation;
      };
    }
  /**
   * UTXO state changed due to memo/nullifier sync.
   *
   * `added` is the number of (unique) UTXOs upserted in this batch after local validation/decryption;
   * it is not guaranteed to equal "newly discovered" rows (may include updates/duplicates).
   */
  | { type: 'wallet:utxo:update'; payload: { chainId: number; added: number; spent: number; frozen: number } }
  | { type: 'assets:update'; payload: { chainId: number; kind: 'token' | 'pool' | 'relayer' } }
  | { type: 'zkp:start'; payload: { circuit: 'transfer' | 'withdraw' } }
  | { type: 'zkp:done'; payload: { circuit: 'transfer' | 'withdraw'; costMs: number } }
  | { type: 'error'; payload: SdkErrorPayload };

/** Record opening used in commitments and memos. */
export interface CommitmentData {
  asset_id: bigint;
  asset_amount: bigint;
  user_pk: { user_address: [bigint, bigint] };
  blinding_factor: bigint;
  is_frozen: boolean;
}

/** Decoded memo record with metadata. */
export interface MemoRecord {
  commitment: Hex;
  memo: Hex;
  timestamp?: number;
  chain_id: number;
  ro: CommitmentData;
  mk_index: number;
}

/** Batch decrypt request entry. */
export interface MemoDecryptRequest {
  memo: Hex;
  secretKey: bigint;
  metadata?: Record<string, unknown>;
}

/** Batch decrypt response entry. */
export interface MemoDecryptResult {
  memo: Hex;
  record: CommitmentData | null;
  metadata?: Record<string, unknown>;
  error?: { message: string };
}

/** Accumulator membership witness used by circuits. */
export interface AccMemberWitness {
  /**
   * Circuits witness format (matches `circuits/pkg/core/policies/witness_json.go`):
   * - `root`: merkle root
   * - `path`: merkle proof path (leaf at index 0, then sibling nodes)
   * - `index`: leaf index
   */
  root: Hex | BigintLikeString;
  path: Array<Hex | BigintLikeString>;
  index: number;
}

/** Input secret (keypair + record opening + merkle witness). */
export interface InputSecret {
  owner_keypair: {
    user_pk: {
      user_address: [bigint, bigint];
      aead_encryption_key?: Hex;
    };
    user_sk: {
      /**
       * Witness payloads can be either raw bigint values (from local key derivation)
       * or decimal strings (from wasm/json bridges).
       */
      address_sk: bigint | BigintLikeString;
      aead_decryption_key?: Hex;
    };
  };
  ro: CommitmentData;
  acc_member_witness: AccMemberWitness;
}

/** Circuits JSON format for field points. */
export interface FrPointJson {
  X: bigint;
  Y: bigint;
}

/** Circuits JSON format for viewer public key. */
export interface ViewerPkJson {
  EncryptionKey: {
    Key: FrPointJson;
  };
}

/** Circuits JSON format for freezer public key. */
export interface FreezerPkJson {
  Point: FrPointJson;
}

/** Witness input for transfer circuit. */
export interface TransferWitnessInput {
  asset_id: string;
  asset_token_id: string;
  asset_policy: {
    viewer_pk: ViewerPkJson;
    freezer_pk: FreezerPkJson;
  };
  input_secrets: InputSecret[];
  array: Hex[];
  fee: bigint;
  max_amount: bigint;
  output_record_openings: CommitmentData[];
  viewing_memo_randomness?: Uint8Array | number[];
  proof_binding?: string;
}

/** Witness input for withdraw circuit. */
export interface WithdrawWitnessInput {
  asset_id: string;
  asset_token_id: string;
  asset_policy: {
    viewer_pk: ViewerPkJson;
    freezer_pk: FreezerPkJson;
  };
  input_secret: InputSecret;
  output_record_opening: CommitmentData;
  array: Hex[];
  amount: bigint;
  relayer_fee: bigint;
  gas_drop_value: bigint;
  viewing_memo_randomness?: Uint8Array | number[];
  proof_binding?: string;
}

/** Witness build output with metadata from context. */
export interface WitnessBuildResult {
  witness: TransferWitnessInput | WithdrawWitnessInput | Record<string, any>;
  array_hash_index?: number;
  merkle_root_index?: number;
  relayer?: string;
  extra_data?: WitnessExtraData;
  relayer_fee?: bigint;
  gas_drop_value?: bigint;
  array_hash_digest?: Hex;
  witness_type?: 'transfer' | 'withdraw';
  warnings?: string[];
}

/** Context fields attached to witness/proof creation. */
export interface WitnessContext {
  array_hash_index?: number;
  merkle_root_index?: number;
  relayer?: string;
  extra_data?: WitnessExtraData;
  relayer_fee?: bigint;
  gas_drop_value?: bigint;
  array_hash_digest?: Hex;
  recipient?: Address;
  withdraw_amount?: bigint;
}

/** Proof result returned from the prover bridge. */
export interface ProofResult {
  proof: [string, string, string, string, string, string, string, string];
  flatten_input: string[];
  public_input?: Record<string, any>;
  array_hash_index?: number;
  merkle_root_index?: number;
  relayer?: string;
  recipient?: Address;
  withdraw_amount?: bigint;
  extra_data?: WitnessExtraData;
  relayer_fee?: bigint;
  gas_drop_value?: bigint;
  array_hash_digest?: Hex;
  gnark_output?: unknown;
  witness_json?: Record<string, any>;
  err?: { message: string; stack?: string } | null;
  warnings?: string[];
}

/** Extra data payload for transfer proofs (3 memos). */
export type TransferExtraData = readonly [Hex, Hex, Hex];
/** Extra data payload for withdraw proofs (1 memo). */
export type WithdrawExtraData = Hex;
/** Union of extra data payloads by action. */
export type WitnessExtraData = TransferExtraData | WithdrawExtraData;

/** Low-level WASM proof bridge interface. */
export interface ProofBridge {
  init(): Promise<void>;
  initTransfer(): Promise<void>;
  initWithdraw(): Promise<void>;
  proveTransfer(witness: string): Promise<string>;
  proveWithdraw(witness: string): Promise<string>;
  createMemo(ro: CommitmentData): Hex;
  decryptMemo(secretKey: bigint, memo: Hex): CommitmentData | null;
  commitment(ro: CommitmentData, format?: 'hex' | 'bigint'): Hex | bigint;
  nullifier(secretKey: bigint, commitment: Hex, freezerPk?: [bigint, bigint]): Hex;
  createDummyRecordOpening(): Promise<CommitmentData>;
  createDummyInputSecret(): Promise<InputSecret>;
}

/** Commitment function overloads by return format. */
export interface CommitmentFn {
  (ro: CommitmentData, format: 'hex'): Hex;
  (ro: CommitmentData, format: 'bigint'): bigint;
  (ro: CommitmentData, format?: undefined): Hex;
}

/** Sync cursors for memo/nullifier/merkle resources. */
export interface SyncCursor {
  memo: number;
  nullifier: number;
  /**
   * Merkle cursor is the merkle root index (batch cursor), derived from memo sync (total elements).
   * The root index typically advances only after a full batch (e.g. 32 leaves), so it will not equal `memo`.
   */
  merkle: number;
}

/** Per-chain sync status (memo/nullifier/merkle). */
export interface SyncChainStatus {
  memo: { status: 'idle' | 'syncing' | 'synced' | 'error'; downloaded: number; total?: number; errorMessage?: string };
  nullifier: { status: 'idle' | 'syncing' | 'synced' | 'error'; downloaded: number; total?: number; errorMessage?: string };
  merkle: { status: 'idle' | 'syncing' | 'synced' | 'error'; cursor: number; errorMessage?: string };
}

/** UTXO list query options. */
export type ListUtxosQuery = {
  /** Filter by chain id. */
  chainId?: number;
  /** Filter by shielded asset id (pool id). */
  assetId?: string;
  /** Include spent UTXOs (default: false). */
  includeSpent?: boolean;
  /** Include frozen UTXOs (default: false). */
  includeFrozen?: boolean;
  /** Filter by spent flag (overrides includeSpent when set). */
  spent?: boolean;
  /** Filter by frozen flag (overrides includeFrozen when set). */
  frozen?: boolean;
  /** Result pagination offset (default: 0). */
  offset?: number;
  /** Result pagination limit (default: no limit). */
  limit?: number;
  /** Order by field (default: mkIndex). */
  orderBy?: 'mkIndex' | 'createdAt';
  /** Order direction (default: asc). */
  order?: 'asc' | 'desc';
};

/** Persisted entry memo record (raw EntryService memo). */
export type EntryMemoRecord = {
  /** Chain id (scoped). */
  chainId: number;
  /** Entry cid (memo index). */
  cid: number;
  /** Commitment of the leaf. */
  commitment: Hex;
  /** Encrypted memo payload. */
  memo: Hex;
  /** EntryService memo transparency flag. */
  isTransparent?: boolean;
  /** Optional transparent asset id override (hex). */
  assetId?: Hex | null;
  /** Optional transparent amount override (hex). */
  amount?: Hex | null;
  /** Optional transparent partial hash. */
  partialHash?: Hex | null;
  /** Optional transaction hash. */
  txHash?: Hex | null;
  /** Optional created_at from EntryService. */
  createdAt?: number | null;
};

/** Persisted entry nullifier record (raw EntryService nullifier). */
export type EntryNullifierRecord = {
  /** Chain id (scoped). */
  chainId: number;
  /**
   * Nullifier index in EntryService ordering (stable for pagination).
   * This is derived from `list_by_block` pagination offsets.
   */
  nid: number;
  /** Nullifier value. */
  nullifier: Hex;
  /** Optional created_at from EntryService. */
  createdAt?: number | null;
};

/** Query options for entry memos. */
export type ListEntryMemosQuery = {
  chainId: number;
  /** Start cid (inclusive). Defaults to 0. */
  offset?: number;
  /** Max rows to return. */
  limit?: number;
  /** Order by field (default: cid). */
  orderBy?: 'cid' | 'createdAt';
  /** Order direction (default: asc). */
  order?: 'asc' | 'desc';
  /** Filter by cid range (inclusive). */
  cidFrom?: number;
  /** Filter by cid range (inclusive). */
  cidTo?: number;
  /** Filter by createdAt range (inclusive, epoch). */
  createdAtFrom?: number;
  /** Filter by createdAt range (inclusive, epoch). */
  createdAtTo?: number;
};

/** Query options for entry nullifiers. */
export type ListEntryNullifiersQuery = {
  chainId: number;
  /** nid offset (defaults to 0). */
  offset?: number;
  /** Max rows to return. */
  limit?: number;
  /** Order by field (default: nid). */
  orderBy?: 'nid' | 'createdAt';
  /** Order direction (default: asc). */
  order?: 'asc' | 'desc';
  /** Filter by nid range (inclusive). */
  nidFrom?: number;
  /** Filter by nid range (inclusive). */
  nidTo?: number;
  /** Filter by createdAt range (inclusive, epoch). */
  createdAtFrom?: number;
  /** Filter by createdAt range (inclusive, epoch). */
  createdAtTo?: number;
};

/** Paged result for entry memos. */
export type ListEntryMemosResult = {
  total: number;
  rows: EntryMemoRecord[];
};

/** Paged result for entry nullifiers. */
export type ListEntryNullifiersResult = {
  total: number;
  rows: EntryNullifierRecord[];
};

/** Paged result for UTXOs. */
export type ListUtxosResult = {
  total: number;
  rows: UtxoRecord[];
};

/** Persisted merkle tree state metadata. */
export type MerkleTreeState = {
  /** Chain id (scoped). */
  chainId: number;
  /** Current tree root (for the merged/main tree). */
  root: Hex;
  /**
   * Total elements that have been merged into the main tree.
   * This matches `totalElementsInTree(contract.totalElements, tempArraySize)`.
   */
  totalElements: number;
  /** Last updated timestamp (ms). */
  lastUpdated: number;
};

/** Persisted merkle leaf record. */
export type MerkleLeafRecord = {
  chainId: number;
  cid: number;
  commitment: Hex;
};

/** Persisted merkle node record. */
export type MerkleNodeRecord = {
  chainId: number;
  /**
   * Node id.
   * - Normal node: `${level}-${position}`
   * - Frontier node: `frontier-${level}`
   */
  id: string;
  level: number;
  position: number;
  hash: Hex;
};

/** Storage adapter interface for persistence. */
export interface StorageAdapter {
  /**
   * Initialize adapter state, optionally scoping storage by wallet id.
   * Implementations should clear any cached state when `walletId` changes.
   */
  init?(options?: { walletId?: string }): Promise<void> | void;
  /** Close connections / flush pending writes. */
  close?(): Promise<void> | void;

  /** Read the last synced cursor for a chain. */
  getSyncCursor(chainId: number): Promise<SyncCursor | undefined>;
  /** Persist the current sync cursor for a chain. */
  setSyncCursor(chainId: number, cursor: SyncCursor): Promise<void>;

  /**
   * Insert or update UTXO records by `(chainId, commitment)`.
   * Implementations should preserve `isSpent` when upserting the same UTXO.
   */
  upsertUtxos(utxos: UtxoRecord[]): Promise<void>;
  /**
   * List UTXOs with optional filters and pagination.
   * Pagination is applied after filtering.
   */
  listUtxos(query?: ListUtxosQuery): Promise<ListUtxosResult>;
  /**
   * Mark matching UTXOs as spent by nullifier.
   * @returns number of updated records.
   */
  markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<number>;

  /**
   * Create a local operation record (e.g. deposit/transfer/withdraw).
   * Implementations should generate `id`, `createdAt`, and default `status` if missing.
   */
  createOperation<TType extends OperationType>(input: OperationCreateInput<TType>): StoredOperation<OperationDetailFor<TType>> & { type: TType };
  /** Update an existing operation record by id (best-effort). */
  updateOperation(id: string, patch: Partial<StoredOperation>): void;
  /** List operations with optional query (`limit`/`offset`/filters). */
  listOperations(input?: number | ListOperationsQuery): StoredOperation[];

  /**
   * Optional governance helpers for long-lived apps.
   * Implementations may persist changes best-effort.
   */
  deleteOperation?(id: string): Promise<boolean> | boolean;
  clearOperations?(): Promise<void> | void;
  pruneOperations?(options?: { max?: number }): Promise<number> | number;

  /**
   * Optional merkle leaf persistence for `MerkleEngine` local/hybrid modes.
   * Leaves are expected to be contiguous and cid-ordered (starting at 0).
   * Implementations may store them best-effort.
   */
  getMerkleLeaves?(chainId: number): Promise<Array<{ cid: number; commitment: Hex }> | undefined>;
  appendMerkleLeaves?(chainId: number, leaves: Array<{ cid: number; commitment: Hex }>): Promise<void>;
  clearMerkleLeaves?(chainId: number): Promise<void>;

  /**
   * Optional Merkle DB: leaf lookup by cid (fast path for proof generation).
   */
  getMerkleLeaf?(chainId: number, cid: number): Promise<MerkleLeafRecord | undefined>;

  /**
   * Optional Merkle DB: node lookup by id (fast path for proof generation and incremental updates).
   */
  getMerkleNode?(chainId: number, id: string): Promise<MerkleNodeRecord | undefined>;
  upsertMerkleNodes?(chainId: number, nodes: MerkleNodeRecord[]): Promise<void>;
  clearMerkleNodes?(chainId: number): Promise<void>;

  /**
   * Optional entry memo persistence (raw EntryService payloads).
   * Useful for debugging, rebuilds, and app-like local caches.
   */
  upsertEntryMemos?(memos: EntryMemoRecord[]): Promise<number> | number;
  listEntryMemos?(query: ListEntryMemosQuery): Promise<ListEntryMemosResult>;
  clearEntryMemos?(chainId: number): Promise<void> | void;

  /**
   * Optional entry nullifier persistence (raw EntryService payloads).
   * Useful for debugging and app-like local caches.
   */
  upsertEntryNullifiers?(nullifiers: EntryNullifierRecord[]): Promise<number> | number;
  listEntryNullifiers?(query: ListEntryNullifiersQuery): Promise<ListEntryNullifiersResult>;
  clearEntryNullifiers?(chainId: number): Promise<void> | void;

  /**
   * Optional merkle tree state persistence (merged/main-tree only).
   * This mirrors the client/app `MerkleDexie.trees` metadata.
   */
  getMerkleTree?(chainId: number): Promise<MerkleTreeState | undefined>;
  setMerkleTree?(chainId: number, tree: MerkleTreeState): Promise<void>;
  clearMerkleTree?(chainId: number): Promise<void>;
}

/** WASM & circuit initialization. Call `ready()` before any proof operations. */
/** Core API for WASM initialization and eventing. */
export interface CoreApi {
  /** Load Go WASM runtime, compile circuits, and initialize proof engine. */
  ready: (onProgress?: (value: number) => void) => Promise<void>;
  /** Release WASM resources and reset internal state. */
  reset: () => void;
  /** Subscribe to a specific SDK event type. */
  on: (type: SdkEvent['type'], handler: (event: SdkEvent) => void) => void;
  /** Unsubscribe from a specific SDK event type. */
  off: (type: SdkEvent['type'], handler: (event: SdkEvent) => void) => void;
}

/** Cryptographic primitives: Poseidon2 commitments, nullifiers, memo encryption. */
/** Crypto primitives exposed by the SDK. */
export interface CryptoApi {
  /** Compute Poseidon2 commitment from record opening data. */
  commitment: CommitmentFn;
  /** Derive nullifier = Poseidon2(commitment, secret_key, merkle_index). */
  nullifier: (secretKey: bigint, commitment: Hex, freezerPk?: [bigint, bigint]) => Hex;
  /** Create a record opening with normalized BigInt fields and random blinding factor. */
  createRecordOpening: (input: {
    asset_id: bigint | number | string;
    asset_amount: bigint | number | string;
    user_pk: { user_address: [bigint | number | string, bigint | number | string] };
    blinding_factor?: bigint | number | string;
    is_frozen?: boolean;
  }) => CommitmentData;
  poolId: (tokenAddress: Hex | bigint | number | string, viewerPk: [bigint, bigint], freezerPk: [bigint, bigint]) => bigint;
  viewingRandomness: () => Uint8Array;
  memo: {
    createMemo: (ro: CommitmentData) => Hex;
    memoNonce: (ephemeralPublicKey: [bigint, bigint], userPublicKey: [bigint, bigint]) => Uint8Array;
    decryptMemo: (secretKey: bigint, memo: Hex) => CommitmentData | null;
    decryptBatch: (requests: MemoDecryptRequest[]) => Promise<MemoDecryptResult[]>;
  };
  dummy: {
    createRecordOpening: () => Promise<CommitmentData>;
    createInputSecret: () => Promise<InputSecret>;
  };
  utils: {
    calcDepositFee: (amount: bigint, feeBps?: number) => bigint;
    randomBytes32: () => Uint8Array;
    randomBytes32Bigint: (isScalar?: boolean) => bigint;
    serializeBigInt: <T>(value: T) => string;
  };
}

/** BabyJubjub key derivation and address conversion. Seed must be >= 16 characters. */
/** Key derivation and address conversion API. */
export interface KeysApi {
  /** Derive full key pair (secret + public) from seed via HKDF-SHA256. */
  deriveKeyPair: (seed: string, nonce?: string) => UserKeyPair;
  /** Derive secret key only (includes public key). */
  getSecretKeyBySeed: (seed: string, nonce?: string) => UserSecretKey;
  /** Derive public key only (no secret key exposure). */
  getPublicKeyBySeed: (seed: string, nonce?: string) => UserPublicKey;
  /** Compress BabyJubjub public key to 32-byte viewing address (0x...). */
  userPkToAddress: (userPk: { user_address: [bigint | string, bigint | string] }) => Hex;
  /** Decompress viewing address back to BabyJubjub public key point. */
  addressToUserPk: (address: Hex) => { user_address: [bigint, bigint] };
}

/** Chain, token, and relayer configuration queries. */
/** Assets API for chain/token/relayer configuration. */
export interface AssetsApi {
  getChains: () => ChainConfigInput[];
  getChain: (chainId: number) => ChainConfigInput;
  getTokens: (chainId: number) => TokenMetadata[];
  getPoolInfo: (chainId: number, tokenId: string) => TokenMetadata | undefined;
  getAllowanceTarget: (chainId: number) => Address;
  appendTokens: (chainId: number, tokens: TokenMetadata[]) => void;
  /** Load chain/token config from a remote JSON URL. */
  loadFromUrl: (url: string) => Promise<void>;
  getRelayerConfig: (chainId: number) => RelayerConfig | undefined;
  /** Fetch latest relayer config (fees, limits) from the relayer service. */
  syncRelayerConfig: (chainId: number) => Promise<RelayerConfig>;
  syncAllRelayerConfigs: () => Promise<void>;
}

/** Storage API exposure for adapter access. */
export interface StorageApi {
  getAdapter: () => StorageAdapter;
}

/** Memo, nullifier, and Merkle tree synchronization from Entry service. */
/** Sync API for EntryService resources. */
export interface SyncApi {
  /** Start background polling. Syncs immediately then repeats at `pollMs` interval. */
  start(options?: { chainIds?: number[]; pollMs?: number }): Promise<void>;
  /** Stop polling and abort any in-flight sync. */
  stop(): void;
  /** Run a single sync pass. Resolves when all requested resources are synced. */
  syncOnce(options?: {
    chainIds?: number[];
    resources?: Array<'memo' | 'nullifier' | 'merkle'>;
    signal?: AbortSignal;
    requestTimeoutMs?: number;
    pageSize?: number;
    continueOnError?: boolean;
  }): Promise<void>;
  getStatus(): Record<number, SyncChainStatus>;
}

/** Merkle proof response shape from remote service. */
export interface RemoteMerkleProofResponse {
  proof: Array<{ path: Array<Hex | BigintLikeString>; leaf_index: string | number }>;
  merkle_root: Hex | BigintLikeString;
  latest_cid: number;
}

/** Merkle API for proof generation and witness building. */
export interface MerkleApi {
  currentMerkleRootIndex: (totalElements: number, tempArraySize?: number) => number;
  /**
   * Get Merkle proofs by cid with local-first fallback behavior.
   *
   * Notes (mirrors client/app behavior):
   * - First try to build proofs locally (if enabled and available).
   * - If local proof is missing for some cids, check whether those cids are still in the on-chain buffer
   *   (i.e. not yet merged into the main tree); such cids do not require remote proof fetching.
   * - Otherwise, fetch missing proofs from the remote proof service.
   */
  getProofByCids: (input: { chainId: number; cids: number[]; totalElements: bigint }) => Promise<RemoteMerkleProofResponse>;
  /** Convenience wrapper for single cid. */
  getProofByCid: (input: { chainId: number; cid: number; totalElements: bigint }) => Promise<RemoteMerkleProofResponse>;
  /**
   * Optional helper for building a local Merkle tree from contiguous Entry memo pages.
   * When supported by the implementation, callers may feed memo batches to enable local proof generation.
   */
  ingestEntryMemos?: (chainId: number, memos: Array<{ cid: number | null; commitment: Hex | string | bigint }>) => Promise<void> | void;
  buildAccMemberWitnesses: (input: { remote: RemoteMerkleProofResponse; utxos: Array<{ commitment: Hex; mkIndex: number }>; arrayHash: bigint; totalElements: bigint }) => AccMemberWitness[];
  buildInputSecretsFromUtxos: (input: {
    remote: RemoteMerkleProofResponse;
    utxos: Array<{ commitment: Hex; memo?: Hex; mkIndex: number }>;
    ownerKeyPair: UserKeyPair;
    arrayHash: bigint;
    totalElements: bigint;
    /**
     * Transfer circuit uses fixed `maxInputs=3`. When provided, the implementation pads the returned
     * list with dummy input secrets to reach this length (and errors if utxos exceed it).
     */
    maxInputs?: number;
  }) => Promise<InputSecret[]>;
}

/** Wallet open session parameters. */
export interface WalletSessionInput {
  seed: string | Uint8Array;
  accountNonce?: number;
}

/** UTXO record stored in local persistence. */
export interface UtxoRecord {
  chainId: number;
  assetId: string;
  amount: bigint;
  commitment: Hex;
  nullifier: Hex;
  mkIndex: number;
  isFrozen: boolean;
  isSpent: boolean;
  memo?: Hex;
  createdAt?: number;
}

/** Wallet session, UTXO queries, and balance. */
/** Wallet API for UTXO queries and session lifecycle. */
export interface WalletApi {
  /** Open wallet session: derive keys from seed, initialize storage. */
  open(session: WalletSessionInput): Promise<void>;
  /** Close session: release keys, flush storage. */
  close(): Promise<void>;
  /** Query unspent UTXOs with optional filters. */
  getUtxos(query?: ListUtxosQuery): Promise<ListUtxosResult>;
  /** Get total balance (sum of unspent, unfrozen UTXO amounts). */
  getBalance(query: { chainId: number; assetId: string }): Promise<bigint>;
  /** Mark UTXOs as spent by their nullifiers. */
  markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<void>;
}

/** Planner estimate result for transfer. */
export type PlannerEstimateTransferResult = {
  action: 'transfer';
  chainId: number;
  assetId: string;
  sendAmount: bigint;
  relayerFee: bigint;
  required: bigint;
  selectedInputs: UtxoRecord[];
  selectedSum: bigint;
  ok: boolean;
  okWithMerge: boolean;
  feeSummary: PlannerFeeSummary;
  maxSummary: PlannerFeeSummary;
  constraints: { maxInputs: number };
};

/** Planner estimate result for withdraw. */
export type PlannerEstimateWithdrawResult = {
  action: 'withdraw';
  chainId: number;
  assetId: string;
  requestedAmount: bigint;
  relayerFee: bigint;
  protocolFee: bigint;
  burnAmount: bigint;
  selectedInput: UtxoRecord | null;
  ok: boolean;
  okWithMerge: boolean;
  feeSummary: PlannerFeeSummary;
  maxSummary: PlannerFeeSummary;
  constraints: { requiresSingleInput: true };
};

/** Planner estimate union. */
export type PlannerEstimateResult = PlannerEstimateTransferResult | PlannerEstimateWithdrawResult;

/** Summary of fees and inputs used by planner. */
export type PlannerFeeSummary = {
  mergeCount: number;
  feeCount: number;
  relayerFeeTotal: bigint;
  protocolFeeTotal: bigint;
  totalInput: bigint;
  outputAmount: bigint;
  cost: bigint;
  inputCount: number;
};

/** Planner max estimate result for transfer/withdraw. */
export type PlannerMaxEstimateResult = {
  action: 'transfer' | 'withdraw';
  chainId: number;
  assetId: string;
  ok: boolean;
  maxSummary: PlannerFeeSummary;
};

/** Transfer plan with inputs/outputs and proof binding. */
export type TransferPlan = {
  action: 'transfer';
  chainId: number;
  assetId: string;
  token: TokenMetadata;
  requestedAmount: bigint;
  sendAmount: bigint;
  to: Hex;
  relayer: Address;
  relayerUrl?: string;
  relayerFee: bigint;
  required: bigint;
  okWithMerge: boolean;
  feeSummary: PlannerFeeSummary;
  maxSummary: PlannerFeeSummary;
  selectedInputs: UtxoRecord[];
  selectedSum: bigint;
  outputs: readonly [CommitmentData, CommitmentData, CommitmentData];
  extraData: readonly [Hex, Hex, Hex];
  proofBinding: string;
};

/** Transfer-merge plan including merge step. */
export type TransferMergePlan = {
  action: 'transfer-merge';
  chainId: number;
  assetId: string;
  requestedAmount: bigint;
  sendAmount: bigint;
  to: Hex;
  relayer: Address;
  relayerUrl?: string;
  relayerFee: bigint;
  required: bigint;
  okWithMerge: boolean;
  feeSummary: PlannerFeeSummary;
  maxSummary: PlannerFeeSummary;
  mergePlan: TransferPlan;
};

/** Withdraw plan with input/output and proof binding. */
export type WithdrawPlan = {
  action: 'withdraw';
  chainId: number;
  assetId: string;
  token: TokenMetadata;
  requestedAmount: bigint;
  relayer: Address;
  relayerUrl?: string;
  relayerFee: bigint;
  protocolFee: bigint;
  burnAmount: bigint;
  gasDropValue: bigint;
  okWithMerge: boolean;
  feeSummary: PlannerFeeSummary;
  maxSummary: PlannerFeeSummary;
  selectedInput: UtxoRecord;
  outputRecordOpening: CommitmentData;
  extraData: Hex;
  proofBinding: string;
  recipient: Hex;
};

/** Planner plan union. */
export type PlannerPlanResult = TransferPlan | TransferMergePlan | WithdrawPlan;

/** Coin selection, fee estimation, and transaction planning. */
/** Planner API for fee estimation and plan creation. */
export interface PlannerApi {
  /** Estimate fees and check if balance is sufficient for an operation. */
  estimate(input: { chainId: number; assetId: string; action: 'transfer' | 'withdraw'; amount: bigint; payIncludesFee?: boolean }): Promise<PlannerEstimateResult>;
  /** Calculate the maximum transferable/withdrawable amount after fees. */
  estimateMax(input: { chainId: number; assetId: string; action: 'transfer' | 'withdraw'; payIncludesFee?: boolean }): Promise<PlannerMaxEstimateResult>;
  /** Build a full transaction plan (coin selection, outputs, proof binding). */
  plan(input: Record<string, unknown>): Promise<PlannerPlanResult>;
}

/** zk-SNARK proof generation via Go WASM (Groth16). Requires `core.ready()`. */
/** ZKP API for witness/proof generation. */
export interface ZkpApi {
  createWitnessTransfer: (input: TransferWitnessInput, context?: WitnessContext) => Promise<WitnessBuildResult>;
  createWitnessWithdraw: (input: WithdrawWitnessInput, context?: WitnessContext) => Promise<WitnessBuildResult>;
  proveTransfer: (witness: TransferWitnessInput | string, context?: WitnessContext) => Promise<ProofResult>;
  proveWithdraw: (witness: WithdrawWitnessInput | string, context?: WitnessContext) => Promise<ProofResult>;
}

/** Relayer request payload built from proofs. */
export interface RelayerRequest {
  kind: 'relayer';
  method: 'POST';
  path: string;
  body: Record<string, unknown>;
}

/** Tx builder API for relayer request construction. */
export interface TxBuilderApi {
  buildTransferCalldata: (input: { chainId: number; proof: ProofResult }) => Promise<RelayerRequest>;
  buildWithdrawCalldata: (input: { chainId: number; proof: ProofResult }) => Promise<RelayerRequest>;
}

/** End-to-end operation orchestration: plan → Merkle proof → witness → zk-SNARK proof → relayer request. */
/** Ops API for end-to-end operations (plan → proof → relayer). */
export interface OpsApi {
  /** Prepare a private transfer (auto-merges UTXOs if needed when `autoMerge: true`). */
  prepareTransfer(input: { chainId: number; assetId: string; amount: bigint; to: Hex; ownerKeyPair: UserKeyPair; publicClient: PublicClient; relayerUrl?: string; autoMerge?: boolean }): Promise<
    | {
        kind: 'transfer';
        plan: TransferPlan;
        witness: TransferWitnessInput;
        proof: ProofResult;
        request: RelayerRequest;
        meta: { arrayHashIndex: number; merkleRootIndex: number; relayer: Address };
      }
    | {
        kind: 'merge';
        plan: TransferMergePlan;
        merge: {
          plan: TransferPlan;
          witness: TransferWitnessInput;
          proof: ProofResult;
          request: RelayerRequest;
          meta: { arrayHashIndex: number; merkleRootIndex: number; relayer: Address };
        };
        nextInput: { chainId: number; assetId: string; amount: bigint; to: Hex; relayerUrl?: string; autoMerge?: boolean };
      }
  >;

  /** Prepare a withdrawal to an EVM address. Optionally includes gas drop. */
  prepareWithdraw(input: {
    chainId: number;
    assetId: string;
    amount: bigint;
    recipient: Address;
    ownerKeyPair: UserKeyPair;
    publicClient: PublicClient;
    gasDropValue?: bigint;
    relayerUrl?: string;
  }): Promise<{
    plan: WithdrawPlan;
    witness: WithdrawWitnessInput;
    proof: ProofResult;
    request: RelayerRequest;
    meta: { arrayHashIndex: number; merkleRootIndex: number; relayer: Address };
  }>;

  /** Prepare a deposit: compute commitment, memo, and build contract call requests. */
  prepareDeposit(input: { chainId: number; assetId: string; amount: bigint; ownerPublicKey: UserPublicKey; account: Address; publicClient: PublicClient }): Promise<{
    chainId: number;
    assetId: string;
    amount: bigint;
    token: TokenMetadata;
    recordOpening: CommitmentData;
    memo: Hex;
    protocolFee: bigint;
    payAmount: bigint;
    depositRelayerFee: bigint;
    value: bigint;
    approveNeeded: boolean;
    approveRequest?: {
      chainId: number;
      address: Address;
      abi: any;
      functionName: 'approve';
      args: [Address, bigint];
    };
    depositRequest: {
      chainId: number;
      address: Address;
      abi: any;
      functionName: 'deposit';
      args: [bigint, bigint, [bigint, bigint], bigint, Hex];
      value: bigint;
    };
  }>;

  /** Execute deposit on-chain: optionally auto-approve ERC-20 then call deposit(). */
  submitDeposit(input: {
    prepared: Awaited<ReturnType<OpsApi['prepareDeposit']>>;
    walletClient: { writeContract: (request: { address: Address; abi: any; functionName: string; args: any; value?: bigint; chainId?: number }) => Promise<Hex> };
    publicClient: PublicClient;
    autoApprove?: boolean;
    confirmations?: number;
    operationId?: string;
  }): Promise<{
    txHash: Hex;
    approveTxHash?: Hex;
    receipt?: TransactionReceipt;
    operationId?: string;
  }>;

  waitRelayerTxHash(input: { relayerUrl: string; relayerTxHash: Hex; timeoutMs?: number; intervalMs?: number; signal?: AbortSignal; operationId?: string; requestUrl?: string }): Promise<Hex>;
  waitForTransactionReceipt(input: { publicClient: PublicClient; txHash: Hex; timeoutMs?: number; pollIntervalMs?: number; confirmations?: number; operationId?: string }): Promise<TransactionReceipt>;
  /** Submit prepared transfer/withdraw to relayer and optionally wait for tx confirmation. */
  submitRelayerRequest<T = unknown>(input: {
    prepared: { plan: TransferPlan | WithdrawPlan; request: RelayerRequest; kind?: 'transfer' | 'merge' };
    relayerUrl?: string;
    signal?: AbortSignal;
    operationId?: string;
    operation?: OperationCreateInput;
    publicClient?: PublicClient;
    relayerTimeoutMs?: number;
    relayerIntervalMs?: number;
    receiptTimeoutMs?: number;
    receiptPollIntervalMs?: number;
    confirmations?: number;
  }): Promise<{
    result: T;
    operationId?: string;
    updateOperation: (patch: Partial<StoredOperation>) => void;
    waitRelayerTxHash: Promise<Hex>;
    transactionReceipt?: Promise<TransactionReceipt>;
  }>;
}

/**
 * The SDK instance returned by `createSdk(config)`.
 *
 * Lifecycle: `core.ready()` → `wallet.open()` → `sync.syncOnce()` → operations → `wallet.close()`
 */
/** SDK instance returned by createSdk(config). */
export interface OCashSdk {
  /** WASM & circuit initialization. */
  core: CoreApi;
  /** Poseidon2 commitments, nullifiers, memo encryption. */
  crypto: CryptoApi;
  /** BabyJubjub key derivation and address conversion. */
  keys: KeysApi;
  /** Chain, token, and relayer configuration. */
  assets: AssetsApi;
  /** Persistence adapter access. */
  storage: StorageApi;
  /** Memo/nullifier/Merkle sync from Entry service. */
  sync: SyncApi;
  /** Merkle proofs and membership witnesses. */
  merkle: MerkleApi;
  /** Wallet session, UTXO queries, balance. */
  wallet: WalletApi;
  /** Coin selection, fee estimation, transaction planning. */
  planner: PlannerApi;
  /** zk-SNARK proof generation (Groth16 via Go WASM). */
  zkp: ZkpApi;
  /** Relayer request payload builder. */
  tx: TxBuilderApi;
  /** End-to-end operation orchestration. */
  ops: OpsApi;
}

/** User public key. */
export interface UserPublicKey {
  user_pk: {
    user_address: [bigint, bigint];
  };
}

/** User secret key (includes public key). */
export interface UserSecretKey extends UserPublicKey {
  user_sk: {
    address_sk: bigint;
  };
}

/** User key pair alias (secret + public). */
export interface UserKeyPair extends UserSecretKey {}
