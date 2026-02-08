# createSdk

The main factory function that creates an SDK instance.

## Signature

```ts
function createSdk(config: OCashSdkConfig): OCashSdk
```

## Parameters

### `OCashSdkConfig`

```ts
interface OCashSdkConfig {
  chains: ChainConfigInput[];
  assetsOverride?: AssetsOverride;
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
    retry?: {
      attempts?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
    };
  };
  onEvent?: (event: SdkEvent) => void;
}
```

## Returns

### `OCashSdk`

An object with the following modules:

| Module | Type | Description |
|--------|------|-------------|
| `core` | `CoreApi` | WASM bridge, circuit loading |
| `keys` | `KeyManager` | Key derivation, address conversion |
| `crypto` | `CryptoToolkit` | Commitments, nullifiers, memos |
| `assets` | `AssetsApi` | Chain/token/relayer configuration |
| `storage` | `StorageAdapter` | Persistence layer |
| `wallet` | `WalletApi` | Session, UTXOs, balance |
| `sync` | `SyncApi` | Entry/Merkle sync |
| `merkle` | `MerkleApi` | Merkle proofs, witnesses |
| `planner` | `PlannerApi` | Coin selection, fee estimation |
| `zkp` | `ZkpApi` | Witness/proof generation |
| `tx` | `TxBuilderApi` | Transaction builder |
| `ops` | `OpsApi` | End-to-end orchestration |

## Example

```ts
import { createSdk } from '@ocash/sdk';

const sdk = createSdk({
  chains: [{
    chainId: 11155111,
    entryUrl: 'https://entry.example.com',
    ocashContractAddress: '0x...',
    relayerUrl: 'https://relayer.example.com',
    tokens: [],
  }],
  onEvent: console.log,
});

// Access modules
await sdk.core.ready();
await sdk.wallet.open({ seed: '...' });
const balance = await sdk.wallet.getBalance({ chainId: 11155111 });
```

## Default Export

The `createSdk` function is also available as the default export:

```ts
import createSdk from '@ocash/sdk';
```
