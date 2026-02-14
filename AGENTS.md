# AGENTS.md — @ocash/sdk

> Context file for AI coding agents (Codex, Devin, etc.)

## What This Is

@ocash/sdk is a TypeScript ZKP SDK for privacy-preserving token operations — deposit, transfer, withdraw — via a UTXO model and zk-SNARK proofs (Groth16, Go WASM). It is headless and multi-environment (browser, Node.js, Electron/Tauri) with a factory pattern.

## Repo Conventions

The repository is a single-package layout. The root `package.json` is the only dependency and scripts entry.

- SDK source: `src/`
- Build output: `dist/` (publish includes only `dist/` and `assets/`)
- Demos: `demos/` (for showcase/debug only; not published with the SDK)
- Browser demo: `pnpm run dev`
- Node demo: `pnpm run demo:node -- <command>`

## Repo Layout

```
src/                          # SDK source (~60 files, ~8400 lines)
  index.ts                    # Main entry: createSdk factory + re-exports
  index.browser.ts            # Browser entry: + IndexedDbStore
  index.node.ts               # Node entry: + FileStore
  types.ts                    # All type definitions (~850 lines)
  errors.ts                   # Error codes and SdkError
  core/                       # SdkCore: event bus, init orchestration
  crypto/                     # Poseidon2, BabyJubjub, key derivation, commitments
  wallet/                     # WalletService: session, UTXO, balance, memo decrypt
  sync/                       # SyncEngine: Entry/Merkle data sync, polling
  planner/                    # Planner: coin selection, change, fee calc, merge
  ops/                        # Ops: end-to-end orchestration (plan → proof → submit)
  proof/                      # ProofEngine: witness/proof generation
  merkle/                     # MerkleEngine: tree build, proof calc, root index
  tx/                         # TxBuilder: relayer request payloads
  store/                      # StorageAdapter impls (Memory/KV/File/IndexedDB)
  memo/                       # MemoKit: ECDH + NaCl secretbox encrypt/decrypt
  abi/                        # Contract ABIs (Ocash.json compiled ABI, ERC20)
  runtime/                    # WasmBridge: WASM loading, runtime detect, asset cache
  ledger/                     # Chain/token/relayer configuration
  assets/                     # Default assets metadata
  abi/                        # Contract ABIs
  dummy/                      # Test data helpers
  utils/                      # Shared utilities (random, signal, url, bigint)
tests/                        # Vitest tests (~38 files)
demos/browser/                # React + Vite + wagmi browser demo
demos/node/                   # Node CLI demo
```

## Commands

```bash
pnpm install                  # Install deps (pnpm 9+ required, NOT npm/yarn)
pnpm run build                # Build SDK (clean + tsup → dist/)
pnpm run type-check           # TypeScript strict check (no emit)
pnpm run test                 # Run tests (vitest)
pnpm run dev                  # Browser demo (Vite, port 5173)
pnpm run dev:sdk              # SDK watch mode (tsup --watch)
pnpm run demo:node -- <cmd>   # Run Node demo (requires build)
pnpm run demo:node:tsx -- <cmd> # Run Node demo via tsx
```

## Tech Stack

- TypeScript 5.8 strict, ES2020 target
- tsup (ESM + CJS dual format, 3 entry points)
- vitest 2.1 (Node env, globals, restoreMocks)
- @noble/curves + @noble/hashes + tweetnacl (crypto)
- viem 2.x (chain interaction)
- Go WASM (Groth16 proofs via WasmBridge)
- pnpm 9.15+, Node 20.19.0+

## Architecture

- Factory pattern: `createSdk(config)` → returns `OCashSdk` with all modules
- Event-driven: all state changes via `onEvent` callback (`SdkEvent` union type)
- UTXO model: not account balances — unspent transaction outputs
- 12 modules: core, keys, crypto, assets, storage, wallet, sync, merkle, planner, zkp, tx, ops
- 3 entry points: `@ocash/sdk` (universal), `@ocash/sdk/browser` (+IndexedDbStore), `@ocash/sdk/node` (+FileStore)

## Contract ABI

`App_ABI` is the complete Foundry-compiled ABI of the OCash contract (95 entries: 49 functions, 17 events, 29 errors). Source: `src/abi/Ocash.json`, imported by `src/abi/app.ts`, exported from `@ocash/sdk`.

All contract functions (`deposit`, `transfer`, `withdraw`, `freeze`) are public with no access control — the ZK proof IS the authorization. This enables external composability: anyone can build SwapOrchestrators, bridges, or custom relayers that call the contract directly with a valid proof.

```ts
import { App_ABI } from '@ocash/sdk';
import { getContract } from 'viem';

const ocash = getContract({ address: contractAddress, abi: App_ABI, client: publicClient });
```

The ABI JSON is extracted from the Foundry compiled output (`Ocash.sol/Ocash.json`), stripped of `internalType` fields and `constructor`/`receive` entries. When the contract is recompiled, regenerate the JSON from the Foundry output.

## Key Patterns

- Error handling: `SdkError(code, message, detail?, cause?)` — not raw throw
- Internal BigInt, external Hex (`0x${string}`)
- Exports converge through entry points — no deep imports like `@ocash/sdk/src/crypto/...`
- `core.ready()` must be called before any proof/witness operations (loads WASM lazily)
- StorageAdapter is an interface — default MemoryStore is non-persistent

## Testing

- All tests in `tests/` directory, file pattern `{module}.test.ts`
- vitest globals: `describe`/`it`/`expect` without import
- `restoreMocks: true` — mocks auto-restore per test
- Seeds in tests must be >= 16 characters
- Run `pnpm run test` — all tests must pass before any change is complete

## Code Style

- Strict TypeScript — no `any`, no `@ts-ignore`
- No comments on obvious code
- Module directories map 1:1 to functionality
- No `shared/`, `common/`, `helpers/` junk directories
- BigInt sort: `(a > b ? 1 : a < b ? -1 : 0)` — never `Number(a - b)`

## OCash SDK Usage Guide

This guide is for agents and AI, based on `src/` and `src/types.ts`.

Package entry points:

- Single entry: `@ocash/sdk`
- Browser and Node demos are for showcase/debug only and do not add SDK entry points or storage

Import example:

```ts
import { createSdk, MemoryStore } from '@ocash/sdk';
```

Recommended lifecycle:

1. `createSdk(config)`
2. `await sdk.core.ready()`
3. `await sdk.wallet.open({ seed, accountNonce })`
4. `await sdk.sync.syncOnce()` or `await sdk.sync.start()`
5. Use `planner` / `ops` / `tx`
6. `await sdk.wallet.close()`

### 1) Minimal Initialization

```ts
const sdk = createSdk({
  chains: [
    {
      chainId: 11155111,
      rpcUrl: 'https://rpc.example.com',
      entryUrl: 'https://entry.example.com',
      merkleProofUrl: 'https://merkle.example.com',
      ocashContractAddress: '0x0000000000000000000000000000000000000000',
      relayerUrl: 'https://relayer.example.com',
      tokens: [],
    },
  ],
  onEvent: console.log,
});

await sdk.core.ready();
await sdk.wallet.open({ seed: 'seed phrase or bytes' });
await sdk.sync.syncOnce();
const balance = await sdk.wallet.getBalance({ chainId, assetId });
```

### 2) Runtime Assets and `assetsOverride`

The SDK requires wasm and circuit files at runtime. If you pass `assetsOverride`, you must provide the full set of assets.

Required assets:

- `wasm_exec.js`
- `app.wasm`
- `transfer.r1cs`
- `transfer.pk`
- `withdraw.r1cs`
- `withdraw.pk`

Full URL example:

```ts
const sdk = createSdk({
  chains: [...],
  assetsOverride: {
    'wasm_exec.js': 'https://cdn.example.com/ocash/wasm_exec.js',
    'app.wasm': 'https://cdn.example.com/ocash/app.wasm',
    'transfer.r1cs': 'https://cdn.example.com/ocash/transfer.r1cs',
    'transfer.pk': 'https://cdn.example.com/ocash/transfer.pk',
    'withdraw.r1cs': 'https://cdn.example.com/ocash/withdraw.r1cs',
    'withdraw.pk': 'https://cdn.example.com/ocash/withdraw.pk',
  },
});
```

Sharded asset example:

```ts
const sdk = createSdk({
  chains: [...],
  assetsOverride: {
    'transfer.pk': [
      'https://cdn.example.com/transfer_pk/00',
      'https://cdn.example.com/transfer_pk/01',
    ],
  },
});
```

Node or Hybrid local files:

```ts
const sdk = createSdk({
  runtime: 'node',
  cacheDir: './.cache/ocash',
  chains: [...],
  assetsOverride: {
    'wasm_exec.js': './assets/wasm_exec.js',
    'app.wasm': './assets/app.wasm',
    'transfer.r1cs': './assets/transfer.r1cs',
    'transfer.pk': './assets/transfer.pk',
    'withdraw.r1cs': './assets/withdraw.r1cs',
    'withdraw.pk': './assets/withdraw.pk',
  },
});
```

Runtime modes:

- `runtime: 'browser'` enables browser path resolution and disables local cache
- `runtime: 'node'` requires absolute URLs and enables `cacheDir`
- `runtime: 'hybrid'` for Electron/Tauri, conditionally enables `cacheDir`

Notes:

- If `assetsOverride` is not set, the SDK uses default URLs
- `cacheDir` caches HTTP(S) assets to avoid re-downloading
- In WebWorker environments, set `runtime: 'browser'` or `runtime: 'hybrid'`

### 3) Storage Adapter

The SDK uses `StorageAdapter` to track UTXOs, sync cursors, and operation history.

Built-in implementations:

- `MemoryStore` from `@ocash/sdk`
- `KeyValueStore` / `RedisStore` / `SqliteStore` from `@ocash/sdk`
- `IndexedDbStore` from `@ocash/sdk/browser`
- `FileStore` from `@ocash/sdk/node`

Example:

```ts
import { createSdk, MemoryStore } from '@ocash/sdk';

const sdk = createSdk({
  chains: [...],
  storage: new MemoryStore(),
});
```

Storage behavior:

- `wallet.open()` calls `storage.init({ walletId })`
- `walletId` defaults to viewing address (derived from seed)
- Changing `walletId` switches namespaces and clears in-process cache

### 4) Events and Errors

Events come from `onEvent` and `sdk.core.on/off`.
Error events are `{ type: 'error', payload: { code, message, detail, cause } }`.

Error codes:

- `CONFIG` `ASSETS` `STORAGE` `SYNC` `CRYPTO` `MERKLE` `WITNESS` `PROOF` `RELAYER`

### 5) Wallet and Sync

Wallet:

```ts
await sdk.wallet.open({ seed, accountNonce: 0 });
const utxos = await sdk.wallet.getUtxos({ chainId });
const balance = await sdk.wallet.getBalance({ chainId, assetId });
await sdk.wallet.markSpent({ chainId, nullifiers: ['0x...'] });
await sdk.wallet.close();
```

Sync:

```ts
await sdk.sync.start({ chainIds: [chainId], pollMs: 10_000 });
await sdk.sync.syncOnce({ chainIds: [chainId], resources: ['memo', 'nullifier', 'merkle'] });
sdk.sync.stop();
const status = sdk.sync.getStatus();
```

Tuning:

```ts
const sdk = createSdk({
  chains: [...],
  sync: {
    pollMs: 10_000,
    pageSize: 200,
    requestTimeoutMs: 20_000,
    retry: { attempts: 3, baseDelayMs: 250, maxDelayMs: 5_000 },
  },
});
```

### 6) Planner

`planner` estimates fees, merge counts, and produces complete transfer/withdraw plans.

```ts
const estimate = await sdk.planner.estimate({
  chainId,
  assetId: tokenId,
  action: 'transfer',
  amount: 1_000_000n,
  payIncludesFee: false,
});

const max = await sdk.planner.estimateMax({
  chainId,
  assetId: tokenId,
  action: 'transfer',
});

const plan = await sdk.planner.plan({
  action: 'transfer',
  chainId,
  assetId: tokenId,
  amount: 1_000_000n,
  to: '0xrecipient',
  relayerUrl: 'https://relayer.example.com',
  autoMerge: true,
});
```

Notes:

- Transfer selects up to 3 inputs and may trigger a merge
- Withdraw uses a single input and optionally `gasDropValue`

### 7) Ops (End-to-End Flow)

`ops` covers plan → merkle proof → witness → proof → relayer request.

Transfer:

```ts
const owner = sdk.keys.deriveKeyPair(seed, nonce);
const prepared = await sdk.ops.prepareTransfer({
  chainId,
  assetId: tokenId,
  amount,
  to: viewingAddress,
  ownerKeyPair: owner,
  publicClient,
  relayerUrl: 'https://relayer.example.com',
  autoMerge: true,
});

if (prepared.kind === 'merge') {
  // prepared.merge is the merge plan
  // prepared.nextInput is used for the final transfer
}

const submit = await sdk.ops.submitRelayerRequest({
  prepared: { plan: prepared.plan, request: prepared.request, kind: prepared.kind },
  publicClient,
});

const relayerTxHash = await submit.waitRelayerTxHash;
const receipt = await submit.transactionReceipt;
```

Withdraw:

```ts
const owner = sdk.keys.deriveKeyPair(seed, nonce);
const prepared = await sdk.ops.prepareWithdraw({
  chainId,
  assetId: tokenId,
  amount,
  recipient: '0xrecipient',
  ownerKeyPair: owner,
  publicClient,
  gasDropValue: 0n,
});

const submit = await sdk.ops.submitRelayerRequest({
  prepared: { plan: prepared.plan, request: prepared.request },
  publicClient,
});
```

Deposit:

```ts
const ownerPub = sdk.keys.getPublicKeyBySeed(seed, nonce);
const prepared = await sdk.ops.prepareDeposit({
  chainId,
  assetId: tokenId,
  amount,
  ownerPublicKey: ownerPub,
  account: account.address,
  publicClient,
});

if (prepared.approveNeeded && prepared.approveRequest) {
  await walletClient.writeContract(prepared.approveRequest);
}
await walletClient.writeContract(prepared.depositRequest);
```

### 8) Manual ZKP and Tx Building

Use this for finer-grained control when bypassing `ops`.

```ts
const witness = await sdk.zkp.createWitnessTransfer(witnessInput, context);
const proof = await sdk.zkp.proveTransfer(witness, context);
const request = await sdk.tx.buildTransferCalldata({ chainId, proof });
```

### 9) Assets and Relayer Config

```ts
const chain = sdk.assets.getChain(chainId);
const tokens = sdk.assets.getTokens(chainId);
await sdk.assets.loadFromUrl('https://cdn.example.com/ledger.json');
const relayer = await sdk.assets.syncRelayerConfig(chainId);
```

### 10) AI Integration Notes

- Call `await sdk.core.ready()` before any ZKP/ops/planner operation
- `ops.prepareTransfer` and `ops.prepareWithdraw` require `chain.rpcUrl`
- `sync` depends on `chain.entryUrl` and `chain.merkleProofUrl`
- `planner.plan` and `ops` inputs for `amount` must be `bigint`
- If `assetsOverride` is not provided, the SDK uses default URLs

### 11) Integration Checklist

- Ensure `chains` includes `chainId`, `rpcUrl`, `entryUrl`, `merkleProofUrl`, `ocashContractAddress`, `relayerUrl`, and `tokens`
- Ensure `assetsOverride` fully covers all assets or use default URLs
- Do not call `planner`, `ops`, or `zkp` before `core.ready()`
- Do not call `wallet`, `sync`, or `ops` before `wallet.open()`
- Use `bigint` for `amount`
- `publicClient` must be a valid viem `PublicClient`
- Call `wallet.close()` when done

### 12) Common Pitfalls

- Passing only partial `assetsOverride` causes asset load failures
- Doing transfer/withdraw before `sync` causes proof build failures
- Passing string or number for `amount` breaks planner/ops
- Ignoring relayer result polling prevents final chain status

## OCash SDK API Reference

This reflects `src/index.ts` and `src/types.ts` exports and is the authoritative contract.

### Main Entry

```ts
import { createSdk } from '@ocash/sdk';
const sdk = createSdk(config);
```

### `OCashSdkConfig`

```ts
export interface OCashSdkConfig {
  chains: ChainConfigInput[];
  assetsOverride?: AssetsOverride;
  memoWorker?: MemoWorkerConfig;
  cacheDir?: string;
  runtime?: 'auto' | 'browser' | 'node' | 'hybrid';
  storage?: StorageAdapter;
  merkle?: {
    mode?: 'remote' | 'local' | 'hybrid';
    treeDepth?: number;
  };
  sync?: {
    pageSize?: number;
    pollMs?: number;
    requestTimeoutMs?: number;
    retry?: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number };
  };
  onEvent?: (event: SdkEvent) => void;
}
```

#### `ChainConfigInput`

```ts
export interface ChainConfigInput {
  chainId: number;
  rpcUrl?: string;
  entryUrl?: string;
  ocashContractAddress?: Address;
  relayerUrl?: string;
  merkleProofUrl?: string;
  tokens?: TokenMetadata[];
  contract?: Address; // legacy field, same as ocashContractAddress
}
```

#### `TokenMetadata`

```ts
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
```

#### Assets Override

```ts
export type AssetOverrideEntry = string | string[];
export interface AssetsOverride {
  [filename: string]: AssetOverrideEntry;
}
```

### `OCashSdk` Overview

```ts
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
```

### `CoreApi`

```ts
export interface CoreApi {
  ready: (onProgress?: (value: number) => void) => Promise<void>;
  reset: () => void;
  on: (type: SdkEvent['type'], handler: (event: SdkEvent) => void) => void;
  off: (type: SdkEvent['type'], handler: (event: SdkEvent) => void) => void;
}
```

### `CryptoApi`

```ts
export interface CryptoApi {
  commitment: (ro: CommitmentData, format?: 'hex' | 'bigint') => Hex | bigint;
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
```

### `KeysApi`

```ts
export interface KeysApi {
  deriveKeyPair: (seed: string, nonce?: string) => UserKeyPair;
  getSecretKeyBySeed: (seed: string, nonce?: string) => UserSecretKey;
  getPublicKeyBySeed: (seed: string, nonce?: string) => UserPublicKey;
  userPkToAddress: (userPk: { user_address: [bigint | string, bigint | string] }) => Hex;
  addressToUserPk: (address: Hex) => { user_address: [bigint, bigint] };
}
```

### `AssetsApi`

```ts
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
```

### `StorageApi` and `StorageAdapter`

```ts
export interface StorageApi {
  getAdapter: () => StorageAdapter;
}
```

```ts
export interface StorageAdapter {
  init?(options?: { walletId?: string }): Promise<void> | void;
  close?(): Promise<void> | void;

  getSyncCursor(chainId: number): Promise<SyncCursor | undefined>;
  setSyncCursor(chainId: number, cursor: SyncCursor): Promise<void>;

  upsertUtxos(utxos: UtxoRecord[]): Promise<void>;
  listUtxos(query?: ListUtxosQuery): Promise<ListUtxosResult>;
  markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<number>;

  createOperation<TType extends OperationType>(input: OperationCreateInput<TType>): StoredOperation & { type: TType };
  updateOperation(id: string, patch: Partial<StoredOperation>): void;
  listOperations(input?: number | ListOperationsQuery): StoredOperation[];

  deleteOperation?(id: string): Promise<boolean> | boolean;
  clearOperations?(): Promise<void> | void;
  pruneOperations?(options?: { max?: number }): Promise<number> | number;

  getMerkleLeaves?(chainId: number): Promise<Array<{ cid: number; commitment: Hex }> | undefined>;
  appendMerkleLeaves?(chainId: number, leaves: Array<{ cid: number; commitment: Hex }>): Promise<void>;
  clearMerkleLeaves?(chainId: number): Promise<void>;

  getMerkleLeaf?(chainId: number, cid: number): Promise<MerkleLeafRecord | undefined>;
  getMerkleNode?(chainId: number, id: string): Promise<MerkleNodeRecord | undefined>;
  upsertMerkleNodes?(chainId: number, nodes: MerkleNodeRecord[]): Promise<void>;
  clearMerkleNodes?(chainId: number): Promise<void>;

  upsertEntryMemos?(memos: EntryMemoRecord[]): Promise<number> | number;
  listEntryMemos?(query: ListEntryMemosQuery): Promise<ListEntryMemosResult>;
  clearEntryMemos?(chainId: number): Promise<void> | void;

  upsertEntryNullifiers?(nullifiers: EntryNullifierRecord[]): Promise<number> | number;
  listEntryNullifiers?(query: ListEntryNullifiersQuery): Promise<ListEntryNullifiersResult>;
  clearEntryNullifiers?(chainId: number): Promise<void> | void;

  getMerkleTree?(chainId: number): Promise<MerkleTreeState | undefined>;
  setMerkleTree?(chainId: number, tree: MerkleTreeState): Promise<void>;
  clearMerkleTree?(chainId: number): Promise<void>;
}
```

### `SyncApi`

```ts
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
```

### `MerkleApi`

```ts
export interface MerkleApi {
  currentMerkleRootIndex: (totalElements: number, tempArraySize?: number) => number;
  getProofByCids: (input: { chainId: number; cids: number[]; totalElements: bigint }) => Promise<RemoteMerkleProofResponse>;
  getProofByCid: (input: { chainId: number; cid: number; totalElements: bigint }) => Promise<RemoteMerkleProofResponse>;
  ingestEntryMemos?: (chainId: number, memos: Array<{ cid: number | null; commitment: Hex | string | bigint }>) => Promise<void> | void;
  buildAccMemberWitnesses: (input: { remote: RemoteMerkleProofResponse; utxos: Array<{ commitment: Hex; mkIndex: number }>; arrayHash: bigint; totalElements: bigint }) => AccMemberWitness[];
  buildInputSecretsFromUtxos: (input: {
    remote: RemoteMerkleProofResponse;
    utxos: Array<{ commitment: Hex; memo?: Hex; mkIndex: number }>;
    ownerKeyPair: UserKeyPair;
    arrayHash: bigint;
    totalElements: bigint;
    maxInputs?: number;
  }) => Promise<InputSecret[]>;
}
```

### `WalletApi`

```ts
export interface WalletApi {
  open(session: WalletSessionInput): Promise<void>;
  close(): Promise<void>;
  getUtxos(query?: ListUtxosQuery): Promise<ListUtxosResult>;
  getBalance(query: { chainId: number; assetId: string }): Promise<bigint>;
  markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<void>;
}
```

### `PlannerApi`

```ts
export interface PlannerApi {
  estimate(input: { chainId: number; assetId: string; action: 'transfer' | 'withdraw'; amount: bigint; payIncludesFee?: boolean }): Promise<PlannerEstimateResult>;

  estimateMax(input: { chainId: number; assetId: string; action: 'transfer' | 'withdraw'; payIncludesFee?: boolean }): Promise<PlannerMaxEstimateResult>;

  plan(input: Record<string, unknown>): Promise<PlannerPlanResult>;
}
```

### `ZkpApi`

```ts
export interface ZkpApi {
  createWitnessTransfer: (input: TransferWitnessInput, context?: WitnessContext) => Promise<WitnessBuildResult>;
  createWitnessWithdraw: (input: WithdrawWitnessInput, context?: WitnessContext) => Promise<WitnessBuildResult>;
  proveTransfer: (witness: TransferWitnessInput | string, context?: WitnessContext) => Promise<ProofResult>;
  proveWithdraw: (witness: WithdrawWitnessInput | string, context?: WitnessContext) => Promise<ProofResult>;
}
```

### `TxBuilderApi`

```ts
export interface TxBuilderApi {
  buildTransferCalldata: (input: { chainId: number; proof: ProofResult }) => Promise<RelayerRequest>;
  buildWithdrawCalldata: (input: { chainId: number; proof: ProofResult }) => Promise<RelayerRequest>;
}
```

### `OpsApi`

```ts
export interface OpsApi {
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
```

### Events

```ts
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
  | { type: 'wallet:utxo:update'; payload: { chainId: number; added: number; spent: number; frozen: number } }
  | { type: 'assets:update'; payload: { chainId: number; kind: 'token' | 'pool' | 'relayer' } }
  | { type: 'zkp:start'; payload: { circuit: 'transfer' | 'withdraw' } }
  | { type: 'zkp:done'; payload: { circuit: 'transfer' | 'withdraw'; costMs: number } }
  | { type: 'error'; payload: SdkErrorPayload };
```

## Full API Reference

See `llms.txt` in repo root for complete API signatures, type definitions, and code examples.
