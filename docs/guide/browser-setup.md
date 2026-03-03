# Browser Setup

How to integrate `@ocash/sdk` in a browser app with Vite.

## Entry Point

Use `@ocash/sdk/browser` — it re-exports everything from the universal entry plus `IndexedDbStore` for persistent browser storage.

```ts
import { createSdk, IndexedDbStore } from '@ocash/sdk/browser';
```

`KeyValueStore`, `RedisStore`, and `SqliteStore` are **not** included in the browser bundle. They live in `@ocash/sdk/node`.

## Vite Config

No special plugins or workarounds are needed. A minimal `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
});
```

## Runtime Assets

The SDK loads WASM and circuit files at runtime via `core.ready()`. By default it fetches from built-in CDN URLs. To override:

```ts
const sdk = createSdk({
  chains: [...],
  runtime: 'browser',
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

If you omit `assetsOverride`, the SDK uses its default URLs. Partial overrides are **not** supported — provide all six assets or none.

## IndexedDbStore

For persistent storage across page reloads:

```ts
const store = new IndexedDbStore({
  dbName: 'myapp',          // default: 'ocash_sdk'
  storeName: 'ocash_store', // default: 'ocash_store'
  maxOperations: 200,
});
```

## Complete Example

```ts
import { createSdk, IndexedDbStore } from '@ocash/sdk/browser';

const sdk = createSdk({
  chains: [
    {
      chainId: 11155111,
      rpcUrl: 'https://rpc.sepolia.example.com',
      entryUrl: 'https://entry.example.com',
      merkleProofUrl: 'https://merkle.example.com',
      ocashContractAddress: '0x...',
      relayerUrl: 'https://relayer.example.com',
      tokens: [],
    },
  ],
  runtime: 'browser',
  storage: new IndexedDbStore(),
  onEvent: (event) => console.log(event.type, event.payload),
});

// Load WASM and circuits
await sdk.core.ready();

// Open wallet
await sdk.wallet.open({ seed: 'your-secret-seed-phrase' });

// Sync on-chain state
await sdk.sync.syncOnce();

// Check balance
const balance = await sdk.wallet.getBalance({
  chainId: 11155111,
  assetId: 'your-token-id',
});
console.log('Balance:', balance);

// Clean up
await sdk.wallet.close();
```
