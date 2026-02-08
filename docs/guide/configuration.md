# Configuration

The `createSdk(config)` factory accepts an `OCashSdkConfig` object:

```ts
import { createSdk } from '@ocash/sdk';

const sdk = createSdk({
  chains: [...],
  assetsOverride: {...},
  storage: myStore,
  runtime: 'browser',
  sync: { pollMs: 15000 },
  onEvent: (event) => { ... },
});
```

## `chains`

Required. Array of chain configurations:

```ts
interface ChainConfigInput {
  chainId: number;              // EVM chain ID
  rpcUrl?: string;              // JSON-RPC URL (for on-chain reads)
  entryUrl?: string;            // Entry Service URL (memo/nullifier sync)
  ocashContractAddress?: string; // OCash contract address
  relayerUrl?: string;          // Relayer service URL
  merkleProofUrl?: string;      // Merkle proof service URL
  tokens?: TokenMetadata[];     // Token configurations
}
```

Each chain must have a unique `chainId`. The SDK supports multi-chain setups.

### Token Metadata

```ts
interface TokenMetadata {
  id: string;                   // Unique token/pool identifier
  symbol: string;               // e.g. "ETH", "USDC"
  decimals: number;             // e.g. 18, 6
  wrappedErc20: string;         // ERC-20 contract address (or zero for native)
  viewerPk: [string, string];   // BabyJubjub viewer public key
  freezerPk: [string, string];  // BabyJubjub freezer public key
  depositFeeBps?: number;       // Deposit fee in basis points
  withdrawFeeBps?: number;      // Withdraw fee in basis points
  transferMaxAmount?: bigint;   // Per-transfer cap
  withdrawMaxAmount?: bigint;   // Per-withdraw cap
}
```

## `assetsOverride`

Optional. Override URLs for WASM and circuit files:

```ts
const sdk = createSdk({
  chains: [...],
  assetsOverride: {
    'wasm_exec.js': 'https://cdn.example.com/wasm_exec.js',
    'app.wasm': 'https://cdn.example.com/app.wasm',
    'transfer.r1cs': 'https://cdn.example.com/transfer.r1cs',
    'transfer.pk': 'https://cdn.example.com/transfer.pk',
    'withdraw.r1cs': 'https://cdn.example.com/withdraw.r1cs',
    'withdraw.pk': 'https://cdn.example.com/withdraw.pk',
  },
});
```

When `assetsOverride` is provided, **all** required files must be specified.

### Chunk Loading

For large files, provide arrays of chunk URLs for parallel/resumable loading:

```ts
assetsOverride: {
  'transfer.pk': [
    'https://cdn.example.com/transfer_pk/00',
    'https://cdn.example.com/transfer_pk/01',
    'https://cdn.example.com/transfer_pk/02',
  ],
}
```

### Local Files (Node.js)

In Node.js or hybrid environments, use local paths:

```ts
assetsOverride: {
  'wasm_exec.js': './assets/wasm_exec.js',
  'app.wasm': './assets/app.wasm',
  // ...
}
```

## `runtime`

Optional. Runtime environment hint:

| Value | Description |
|-------|-------------|
| `'auto'` | Auto-detect (default) |
| `'browser'` | Browser environment |
| `'node'` | Node.js environment |
| `'hybrid'` | Electron/Tauri hybrid container |

Affects URL resolution and local caching behavior.

## `storage`

Optional. Custom `StorageAdapter` instance. Defaults to `MemoryStore`.

```ts
import { IndexedDbStore } from '@ocash/sdk/browser';

const sdk = createSdk({
  chains: [...],
  storage: new IndexedDbStore({ dbName: 'myapp' }),
});
```

See [Storage Adapters](./storage) for details.

## `cacheDir`

Optional (Node.js/hybrid only). Local directory for caching WASM/circuit files:

```ts
const sdk = createSdk({
  chains: [...],
  cacheDir: './cache',
});
```

## `sync`

Optional. Default sync parameters:

```ts
sync: {
  pageSize: 512,           // Entries per page (default: 512)
  pollMs: 15_000,          // Background poll interval (default: 15s)
  requestTimeoutMs: 20_000, // HTTP timeout (default: 20s)
  retry: {                  // Retry policy (optional)
    attempts: 3,
    baseDelayMs: 250,
    maxDelayMs: 5_000,
  },
}
```

These defaults can be overridden per-call via `sync.start()` or `sync.syncOnce()`.

## `merkle`

Optional. Merkle tree configuration:

```ts
merkle: {
  mode: 'hybrid',   // 'remote' | 'local' | 'hybrid' (default: 'hybrid')
  treeDepth: 32,    // Merkle tree depth (default: 32)
}
```

## `onEvent`

Optional. Event callback for all SDK events:

```ts
onEvent: (event) => {
  switch (event.type) {
    case 'core:ready':
      console.log('SDK ready in', event.payload.durationMs, 'ms');
      break;
    case 'sync:progress':
      console.log(event.payload.resource, event.payload.downloaded);
      break;
    case 'error':
      console.error(event.payload.code, event.payload.message);
      break;
  }
}
```

See [Events & Errors](./events) for all event types.
