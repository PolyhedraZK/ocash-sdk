# Getting Started

## Installation

```bash
# pnpm (recommended)
pnpm add @ocash/sdk

# npm
npm install @ocash/sdk

# yarn
yarn add @ocash/sdk
```

## Entry Points

The SDK provides three entry points for different environments:

| Import               | Environment | Storage Adapter         |
| -------------------- | ----------- | ----------------------- |
| `@ocash/sdk`         | Universal   | `MemoryStore` (default) |
| `@ocash/sdk/browser` | Browser     | `IndexedDbStore`        |
| `@ocash/sdk/node`    | Node.js     | `FileStore`             |

```ts
// Universal (works everywhere)
import { createSdk } from '@ocash/sdk';

// Browser (includes IndexedDbStore)
import { createSdk, IndexedDbStore } from '@ocash/sdk/browser';

// Node.js (includes FileStore)
import { createSdk, FileStore } from '@ocash/sdk/node';
```

## Quick Start

```ts
import { createSdk } from '@ocash/sdk';

// 1. Create SDK instance
const sdk = createSdk({
  chains: [
    {
      chainId: 11155111,
      entryUrl: 'https://entry.example.com',
      ocashContractAddress: '0x...',
      relayerUrl: 'https://relayer.example.com',
      merkleProofUrl: 'https://merkle.example.com',
      tokens: [],
    },
  ],
  onEvent: (event) => console.log(event.type, event.payload),
});

// 2. Load WASM & circuits
await sdk.core.ready();

// 3. Open wallet session
await sdk.wallet.open({ seed: 'your-secret-seed-phrase' });

// 4. Sync on-chain state
await sdk.sync.syncOnce();

// 5. Check balance
const balance = await sdk.wallet.getBalance({ chainId, assetId });
console.log('Balance:', balance);

// 6. Clean up
await sdk.wallet.close();
```

## Lifecycle

The recommended integration order:

```
createSdk(config)           → Initialize SDK
  ↓
sdk.core.ready()            → Load WASM & circuit files
  ↓
sdk.wallet.open({ seed })   → Derive keys, open storage
  ↓
sdk.sync.syncOnce()         → Fetch memos, nullifiers, merkle state
  or sdk.sync.start()       → Background polling
  ↓
sdk.planner / sdk.ops       → Plan & execute operations
  ↓
sdk.wallet.close()          → Release keys, flush storage
```

## Requirements

- **Node.js**: >= 20.19.0 (native `fetch` + `WebAssembly`)
- **Browser**: Modern browsers with `WebAssembly`, `crypto.getRandomValues`, `fetch`
- **pnpm**: >= 9.0.0 (if contributing)

## Next Steps

- [Configuration](./configuration) — SDK options in detail
- [Architecture](./architecture) — Understand the module system
- [Deposit](./deposit) — Shield tokens into the privacy pool
