import type { Address, PublicClient } from 'viem';
import type { ListOperationsQuery, OperationCreateInput, OperationDetailFor, OperationType, StoredOperation } from './store/operationTypes';
export type { ListOperationsQuery, OperationCreateInput, OperationDetailFor, OperationType, StoredOperation } from './store/operationTypes';

export type Hex = `0x${string}`;
export type BigintLikeString = string;
export type TransactionReceipt = Awaited<ReturnType<PublicClient['waitForTransactionReceipt']>>;

export type SdkErrorCode = 'CONFIG' | 'ASSETS' | 'STORAGE' | 'SYNC' | 'CRYPTO' | 'MERKLE' | 'WITNESS' | 'PROOF' | 'RELAYER';

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

export interface RelayerFeeEntry {
  token_address: Hex;
  fee: bigint;
}

export interface RelayerFeeConfigure {
  valid_time: number;
  transfer: Record<string, RelayerFeeEntry>;
  withdraw: Record<string, RelayerFeeEntry>;
}

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

export interface MemoWorkerConfig {
  workerUrl?: string;
  concurrency?: number;
  type?: 'classic' | 'module';
}

export type AssetOverrideEntry = string | string[];

export interface AssetsOverride {
  [filename: string]: AssetOverrideEntry;
}

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

export interface SdkErrorPayload {
  code: SdkErrorCode;
  message: string;
  detail?: unknown;
  cause?: unknown;
}

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

export interface CommitmentData {
  asset_id: bigint;
  asset_amount: bigint;
  user_pk: { user_address: [bigint, bigint] };
  blinding_factor: bigint;
  is_frozen: boolean;
}

export interface MemoRecord {
  commitment: Hex;
  memo: Hex;
  timestamp?: number;
  chain_id: number;
  ro: CommitmentData;
  mk_index: number;
}

export interface MemoDecryptRequest {
  memo: Hex;
  secretKey: bigint;
  metadata?: Record<string, unknown>;
}

export interface MemoDecryptResult {
  memo: Hex;
  record: CommitmentData | null;
  metadata?: Record<string, unknown>;
  error?: { message: string };
}

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

export interface FrPointJson {
  X: bigint;
  Y: bigint;
}

export interface ViewerPkJson {
  EncryptionKey: {
    Key: FrPointJson;
  };
}

export interface FreezerPkJson {
  Point: FrPointJson;
}

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

export type TransferExtraData = readonly [Hex, Hex, Hex];
export type WithdrawExtraData = Hex;
export type WitnessExtraData = TransferExtraData | WithdrawExtraData;

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

export interface CommitmentFn {
  (ro: CommitmentData, format: 'hex'): Hex;
  (ro: CommitmentData, format: 'bigint'): bigint;
  (ro: CommitmentData, format?: undefined): Hex;
}

export interface SyncCursor {
  memo: number;
  nullifier: number;
  /**
   * Merkle cursor is the merkle root index (batch cursor), derived from memo sync (total elements).
   * The root index typically advances only after a full batch (e.g. 32 leaves), so it will not equal `memo`.
   */
  merkle: number;
}

export interface SyncChainStatus {
  memo: { status: 'idle' | 'syncing' | 'synced' | 'error'; downloaded: number; total?: number; errorMessage?: string };
  nullifier: { status: 'idle' | 'syncing' | 'synced' | 'error'; downloaded: number; total?: number; errorMessage?: string };
  merkle: { status: 'idle' | 'syncing' | 'synced' | 'error'; cursor: number; errorMessage?: string };
}

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

export type EntryMemoRecord = {
  /** Chain id (scoped). */
  chainId: number;
  /** Entry cid (memo index). */
  cid: number;
  /** Commitment of the leaf. */
  commitment: Hex;
  /** Encrypted memo payload. */
  memo: Hex;
  /** Optional created_at from EntryService. */
  createdAt?: number | null;
};

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

export type ListEntryMemosResult = {
  total: number;
  rows: EntryMemoRecord[];
};

export type ListEntryNullifiersResult = {
  total: number;
  rows: EntryNullifierRecord[];
};

export type ListUtxosResult = {
  total: number;
  rows: UtxoRecord[];
};

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

export type MerkleLeafRecord = {
  chainId: number;
  cid: number;
  commitment: Hex;
};

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

export interface CoreApi {
  ready: (onProgress?: (value: number) => void) => Promise<void>;
  reset: () => void;
  on: (type: SdkEvent['type'], handler: (event: SdkEvent) => void) => void;
  off: (type: SdkEvent['type'], handler: (event: SdkEvent) => void) => void;
}

export interface CryptoApi {
  commitment: CommitmentFn;
  nullifier: (secretKey: bigint, commitment: Hex, freezerPk?: [bigint, bigint]) => Hex;
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

export interface KeysApi {
  deriveKeyPair: (seed: string, nonce?: string) => UserKeyPair;
  getSecretKeyBySeed: (seed: string, nonce?: string) => UserSecretKey;
  getPublicKeyBySeed: (seed: string, nonce?: string) => UserPublicKey;
  userPkToAddress: (userPk: { user_address: [bigint | string, bigint | string] }) => Hex;
  addressToUserPk: (address: Hex) => { user_address: [bigint, bigint] };
}

export interface AssetsApi {
  getChains: () => ChainConfigInput[];
  getChain: (chainId: number) => ChainConfigInput;
  getTokens: (chainId: number) => TokenMetadata[];
  getPoolInfo: (chainId: number, tokenId: string) => TokenMetadata | undefined;
  getAllowanceTarget: (chainId: number) => Address;
  appendTokens: (chainId: number, tokens: TokenMetadata[]) => void;
  loadFromUrl: (url: string) => Promise<void>;
  getRelayerConfig: (chainId: number) => RelayerConfig | undefined;
  syncRelayerConfig: (chainId: number) => Promise<RelayerConfig>;
  syncAllRelayerConfigs: () => Promise<void>;
}

export interface StorageApi {
  getAdapter: () => StorageAdapter;
}

export interface SyncApi {
  start(options?: { chainIds?: number[]; pollMs?: number }): Promise<void>;
  stop(): void;
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

export interface RemoteMerkleProofResponse {
  proof: Array<{ path: Array<Hex | BigintLikeString>; leaf_index: string | number }>;
  merkle_root: Hex | BigintLikeString;
  latest_cid: number;
}

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
  buildAccMemberWitnesses: (input: {
    remote: RemoteMerkleProofResponse;
    utxos: Array<{ commitment: Hex; mkIndex: number }>;
    arrayHash: bigint;
    totalElements: bigint;
  }) => AccMemberWitness[];
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

export interface WalletSessionInput {
  seed: string | Uint8Array;
  accountNonce?: number;
}

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

export interface WalletApi {
  open(session: WalletSessionInput): Promise<void>;
  close(): Promise<void>;
  getUtxos(query?: ListUtxosQuery): Promise<ListUtxosResult>;
  getBalance(query?: { chainId?: number; assetId?: string }): Promise<bigint>;
  markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<void>;
}

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

export type PlannerEstimateResult = PlannerEstimateTransferResult | PlannerEstimateWithdrawResult;

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

export type PlannerMaxEstimateResult = {
  action: 'transfer' | 'withdraw';
  chainId: number;
  assetId: string;
  ok: boolean;
  maxSummary: PlannerFeeSummary;
};

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

export type PlannerPlanResult = TransferPlan | TransferMergePlan | WithdrawPlan;

export interface PlannerApi {
  estimate(input: {
    chainId: number;
    assetId: string;
    action: 'transfer' | 'withdraw';
    amount: bigint;
    payIncludesFee?: boolean;
  }): Promise<PlannerEstimateResult>;
  estimateMax(input: { chainId: number; assetId: string; action: 'transfer' | 'withdraw'; payIncludesFee?: boolean }): Promise<PlannerMaxEstimateResult>;
  plan(input: Record<string, unknown>): Promise<PlannerPlanResult>;
}

export interface ZkpApi {
  createWitnessTransfer: (input: TransferWitnessInput, context?: WitnessContext) => Promise<WitnessBuildResult>;
  createWitnessWithdraw: (input: WithdrawWitnessInput, context?: WitnessContext) => Promise<WitnessBuildResult>;
  proveTransfer: (witness: TransferWitnessInput | string, context?: WitnessContext) => Promise<ProofResult>;
  proveWithdraw: (witness: WithdrawWitnessInput | string, context?: WitnessContext) => Promise<ProofResult>;
}

export interface RelayerRequest {
  kind: 'relayer';
  method: 'POST';
  path: string;
  body: Record<string, unknown>;
}

export interface TxBuilderApi {
  buildTransferCalldata: (input: { chainId: number; proof: ProofResult }) => Promise<RelayerRequest>;
  buildWithdrawCalldata: (input: { chainId: number; proof: ProofResult }) => Promise<RelayerRequest>;
}

export interface OpsApi {
  prepareTransfer(input: {
    chainId: number;
    assetId: string;
    amount: bigint;
    to: Hex;
    ownerKeyPair: UserKeyPair;
    publicClient: PublicClient;
    relayerUrl?: string;
    autoMerge?: boolean;
  }): Promise<{
    kind: 'transfer';
    plan: TransferPlan;
    witness: TransferWitnessInput;
    proof: ProofResult;
    request: RelayerRequest;
    meta: { arrayHashIndex: number; merkleRootIndex: number; relayer: Address };
  } | {
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
  }>;

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

  prepareDeposit(input: {
    chainId: number;
    assetId: string;
    amount: bigint;
    ownerPublicKey: UserPublicKey;
    account: Address;
    publicClient: PublicClient;
  }): Promise<{
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

  waitRelayerTxHash(input: {
    relayerUrl: string;
    relayerTxHash: Hex;
    timeoutMs?: number;
    intervalMs?: number;
    signal?: AbortSignal;
    operationId?: string;
    requestUrl?: string;
  }): Promise<Hex>;
  waitForTransactionReceipt(input: {
    publicClient: PublicClient;
    txHash: Hex;
    timeoutMs?: number;
    pollIntervalMs?: number;
    confirmations?: number;
    operationId?: string;
  }): Promise<TransactionReceipt>;
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
    TransactionReceipt?: Promise<TransactionReceipt>;
  }>;
}

export interface OCashSdk {
  core: CoreApi;
  crypto: CryptoApi;
  keys: KeysApi;
  assets: AssetsApi;
  storage: StorageApi;
  sync: SyncApi;
  merkle: MerkleApi;
  wallet: WalletApi;
  planner: PlannerApi;
  zkp: ZkpApi;
  tx: TxBuilderApi;
  ops: OpsApi;
}

export interface UserPublicKey {
  user_pk: {
    user_address: [bigint, bigint];
  };
}

export interface UserSecretKey extends UserPublicKey {
  user_sk: {
    address_sk: bigint;
  };
}

export interface UserKeyPair extends UserSecretKey {}
