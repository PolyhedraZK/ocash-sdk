# @ocash/sdk

TypeScript implementation of the OCash ZKP SDK, providing a unified API for browser, hybrid container, and Node.js environments:

- `createSdk(config)`: Returns the top-level module collection of the headless SDK
- `core.ready()`: Automatically loads Go WASM and transfer/withdraw circuits, emitting events
- `assets`: Chain/token/relayer configuration reading and relayer config synchronization
- `storage`: Persistence adapter (defaults to in-memory storage; host-injectable)
- `wallet`: Wallet session (seed -> viewing address), UTXO/balance queries and spent marking
- `sync`: Memo/nullifier sync via Entry Service (requires `chain.entryUrl`); merkle sync for updating on-chain merkle "head" (requires `chain.merkleProofUrl`)
- `zkp`: Witness/proof generation (calls WASM)
- `planner`: Transaction planning (coin selection/change/fee/proof binding/extraData), with merge count and fee summary calculation
- `tx`: Build relayer request payloads (transfer/burn)
- `ops`: End-to-end orchestration (plan -> merkle proof -> witness -> proof -> relayer request)

## Build

```bash
pnpm install
pnpm run build
```

## Development Scripts

- `pnpm run dev`: Start browser demo (Vite)
- `pnpm run dev:sdk`: Watch SDK builds (tsup)
- `pnpm run demo:node -- <command>`: Run Node demo

All demos are in `demos/` and are for demonstration and debugging only; they are not included in the published package.

## M1: Asset Output / Hosting / Integration (Integration Ready)

The host may optionally provide runtime assets (`wasm_exec.js`, `app.wasm`, `transfer.r1cs/pk`, `withdraw.r1cs/pk`).

## Minimal Usage (Example)

```ts
const sdk = createSdk({
  chains: [
    {
      chainId: 11155111,
      entryUrl: 'https://entry.example.com',
      ocashContractAddress: '0x0000000000000000000000000000000000000000',
      relayerUrl: 'https://relayer.example.com',
      tokens: [],
    },
  ],
  assetsOverride: {
    'wasm_exec.js': 'https://cdn.example.com/ocash/wasm_exec.js',
    'app.wasm': 'https://cdn.example.com/ocash/app.wasm',
    'transfer.r1cs': 'https://cdn.example.com/ocash/transfer.r1cs',
    'transfer.pk': 'https://cdn.example.com/ocash/transfer.pk',
    'withdraw.r1cs': 'https://cdn.example.com/ocash/withdraw.r1cs',
    'withdraw.pk': 'https://cdn.example.com/ocash/withdraw.pk',
  },
  onEvent: console.log,
});

await sdk.core.ready();
await sdk.wallet.open({ seed: '...' });
await sdk.sync.syncOnce();
const balance = await sdk.wallet.getBalance({ chainId: 11155111 });
```

## Recommended Lifecycle (Host Integration Order)

- Initialize: `const sdk = createSdk(...)`
- Resources ready: `await sdk.core.ready()`
- Open wallet session: `await sdk.wallet.open({ seed, accountNonce })`
- Sync on-chain view: `await sdk.sync.syncOnce()` or `await sdk.sync.start()`
- Execute operations: `sdk.planner`/`sdk.ops`/`sdk.tx` (choose based on business needs)
- Exit: `await sdk.wallet.close()` (triggers the store's `close()` and waits for flush)

## Ops (End-to-End Transfer/Withdraw)

`ops` consolidates the common demo workflow into a single pipeline: `plan -> merkle proof -> witness -> prove -> relayer request`.

```ts
const owner = sdk.keys.deriveKeyPair(seed, nonce);
const prepared = await sdk.ops.prepareTransfer({
  chainId,
  assetId: tokenId,
  amount,
  to: viewingAddress,
  ownerKeyPair: owner,
  publicClient, // viem PublicClient
});
// prepared.plan.feeSummary -> { mergeCount, relayerFeeTotal, protocolFeeTotal, ... }

// Submit to relayer + poll for txhash
const submit = await sdk.ops.submitRelayerRequest({ prepared, publicClient });
const chainTxHash = await submit.waitRelayerTxHash;
const receipt = await submit.TransactionReceipt;
```

## Planner (Merge Count / Max Transferable)

`planner.estimate` and `planner.plan` include `feeSummary/maxSummary`:

- `feeSummary.mergeCount`: Number of merges required for this operation (triggered when >3 UTXOs selected)
- `feeSummary.relayerFeeTotal`: Total relayer fee (merge steps + final operation)
- `maxSummary.outputAmount`: Maximum transferable amount from current balance (after fees)

To get the max transferable amount separately, use `planner.estimateMax`.

## Ops (Deposit)

Deposits go through the on-chain `App.deposit`; `prepareDeposit` calculates the protocol fee, reads `depositRelayerFee`, and provides an `approve` request for ERC20 scenarios.
The SDK also encrypts the `recordOpening` into a `memo` (`bytes`) and fills it into `depositRequest.args[4]` for subsequent wallet sync/decryption.

```ts
const ownerPub = sdk.keys.getPublicKeyBySeed(seed, nonce);
const prepared = await sdk.ops.prepareDeposit({
  chainId,
  assetId: tokenId,
  amount,
  ownerPublicKey: ownerPub,
  account: account.address, // EVM account
  publicClient,
});

if (prepared.approveNeeded && prepared.approveRequest) {
  await walletClient.writeContract(prepared.approveRequest);
}
await walletClient.writeContract(prepared.depositRequest);
```

## Runtime Assets - `assetsOverride`

Use `assetsOverride` to provide full URLs or chunk lists for WASM/circuit files. The SDK downloads and assembles them in order. Pass chunk arrays to
leverage browser caching and resume capabilities (e.g., chunks in `00/01/...` order).

```ts
const sdk = createSdk({
  chains: [...],
  assetsOverride: {
    // Specify full URL directly
    'app.wasm': 'https://cdn.example.com/ocash/app.wasm',
    'wasm_exec.js': 'https://cdn.example.com/ocash/wasm_exec.js',
    // Chunks: explicitly list each chunk path for independent browser caching
    'transfer.pk': [
      'https://cdn.example.com/ocash/transfer_pk_8_xxx/00',
      'https://cdn.example.com/ocash/transfer_pk_8_xxx/01',
      // ...
    ],
  },
});
```

When `assetsOverride` is provided, all required files (`wasm_exec.js`, `app.wasm`, `transfer.r1cs/pk`, `withdraw.r1cs/pk`) must be explicitly configured.
If chunk arrays are provided, each chunk can be independently cached by the browser, improving large file loading performance.

`assetsOverride` is optional; when omitted, the SDK uses built-in default asset URLs (suitable for testnet).

### Node/Hybrid Local Files (Optional)

In Node (or hybrid with `node:fs` available) environments, `assetsOverride` accepts local file paths or `file://` URLs in addition to HTTP(S) URLs:

```ts
const sdk = createSdk({
  chains: [...],
  runtime: 'node',
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

Node 20+ requires native `fetch/WebAssembly` support; for hybrid containers, ensure `globalThis.crypto.getRandomValues` is available.

### Demo

Browser demo:

```bash
pnpm run dev
```

Node demo:

```bash
pnpm run demo:node -- --help
```

### Runtime Selection

- `runtime: 'browser'`: Treat as browser environment (relative URLs resolved with `window.location.origin`; local file caching disabled)
- `runtime: 'node'`: Treat as Node environment (asset URLs must be absolute; `cacheDir` local file caching enabled)
- `runtime: 'hybrid'`: For Electron/Tauri hybrid containers (relative URLs resolved as browser; `cacheDir` local caching enabled when available)

In WebWorker or other environments without `window`, the SDK uses `globalThis.location.origin` for relative URL resolution (recommended to explicitly set `runtime: 'browser'` or `runtime: 'hybrid'`).

`cacheDir` persists runtime assets fetched via HTTP(S) (including `wasm_exec.js`, `app.wasm`, `*.r1cs`, `*.pk`, and chunks) to local disk, avoiding re-downloads on each startup.

### Sync Parameter Tuning

Set default sync parameters via `createSdk({ sync: { pollMs, pageSize, requestTimeoutMs } })`; override per-call with `sync.start({ pollMs })` / `sync.syncOnce({ pageSize, requestTimeoutMs })`.

#### Sync Retry (Optional)

For unstable networks, enable request retry:

```ts
const sdk = createSdk({
  chains: [...],
  sync: {
    requestTimeoutMs: 20_000,
    retry: { attempts: 3, baseDelayMs: 250, maxDelayMs: 5_000 },
  },
});
```

## Events and Error Codes

- All events are dispatched via the `onEvent` callback; errors use `{ type: 'error', payload: { code, message, detail, cause } }`
- `code` (`SdkErrorCode`) includes: `CONFIG`/`ASSETS`/`STORAGE`/`SYNC`/`CRYPTO`/`MERKLE`/`WITNESS`/`PROOF`/`RELAYER`

## Store (Storage + Operation Records/History)

The SDK provides a unified `StorageAdapter`: wallet state (UTXO/sync cursor) + business operation records (deposit/transfer/withdraw).

`wallet.open()` calls `storage.init({ walletId })`, where `walletId` defaults to the viewing address (derived from seed).
When the same store instance switches to a different `walletId`, it switches namespaces and clears in-process cached state to prevent data leakage between wallets; persistent implementations (e.g., `FileStore`/`KeyValueStore`) use different storage keys/files per walletId.

Persistent stores serialize writes internally to prevent concurrent `createOperation/updateOperation` saves from causing state rollbacks; `close()` waits for all pending writes to complete.

Built-in implementations:

- `MemoryStore` (universal)
- `KeyValueStore` / `RedisStore` / `SqliteStore` (universal)
- `FileStore` (Node): import from `@ocash/sdk/node`
- `IndexedDbStore` (Browser): import from `@ocash/sdk/browser`

### Entry/Merkle Cache (Optional)

`StorageAdapter` also supports raw Entry data caching and Merkle metadata:

- `upsertEntryMemos` / `listEntryMemos`: Cache EntryService memo page data (cid/commitment/memo/createdAt), with filtering/sorting/pagination, returns `{ total, rows }`
- `upsertEntryNullifiers` / `listEntryNullifiers`: Cache EntryService nullifier data, with filtering/sorting/pagination, returns `{ total, rows }`
- `getMerkleTree` / `setMerkleTree`: Cache "merged to main tree" Merkle metadata (root/totalElements/lastUpdated)

These interfaces are best-effort: SDK sync and proof workflows don't strictly depend on them, but implementing them enables debugging, export, and a more app-like local data view.

### Operations Governance (Optional)

Long-running applications should set `maxOperations` on persistent stores to prevent unbounded operation history growth; optional governance methods for cleanup:

- `deleteOperation(id)`: Delete a single record
- `clearOperations()`: Clear all history
- `pruneOperations({ max })`: Retain only the latest N records

### Operation Records

```ts
const submit = await sdk.ops.submitRelayerRequest({ prepared, publicClient });
const chainTxHash = await submit.waitRelayerTxHash;
const receipt = await submit.TransactionReceipt;
```

### Operation Record Queries (Filter/Paginate)

`listOperations` accepts a numeric `limit` or a query object:

```ts
const ops = store.listOperations({
  chainId,
  tokenId,
  type: 'transfer',
  status: 'submitted',
  limit: 20,
  offset: 0,
  sort: 'desc',
});
```

## Demo

- Node.js runnable demo: `demos/node/README.md`
