# Events & Errors

## Event System

All SDK modules emit events through the `onEvent` callback:

```ts
const sdk = createSdk({
  chains: [...],
  onEvent: (event) => {
    console.log(event.type, event.payload);
  },
});
```

Events follow the `SdkEvent` union type — each event has a `type` string and a typed `payload`.

## Event Types

### Core Events

```ts
// WASM and circuits loaded successfully
{ type: 'core:ready', payload: { assetsVersion: string; durationMs: number } }

// Loading progress (fetch, compile, init stages)
{ type: 'core:progress', payload: { stage: 'fetch' | 'compile' | 'init'; loaded: number; total?: number } }
```

### Sync Events

```ts
// Sync started for a chain
{ type: 'sync:start', payload: { chainId: number; source: 'entry' | 'rpc' | 'subgraph' } }

// Sync progress (memos, nullifiers, merkle)
{ type: 'sync:progress', payload: { chainId: number; resource: 'memo' | 'nullifier' | 'merkle'; downloaded: number; total?: number } }

// Sync completed for a chain
{ type: 'sync:done', payload: { chainId: number; cursor: SyncCursor } }
```

### Wallet Events

```ts
// UTXOs updated after sync
{ type: 'wallet:utxo:update', payload: { chainId: number; added: number; spent: number; frozen: number } }
```

### ZKP Events

```ts
// Proof generation started
{ type: 'zkp:start', payload: { circuit: 'transfer' | 'withdraw' } }

// Proof generation completed
{ type: 'zkp:done', payload: { circuit: 'transfer' | 'withdraw'; costMs: number } }
```

### Assets Events

```ts
// Chain/token configuration updated
{ type: 'assets:update', payload: { chainId: number; kind: 'token' | 'pool' | 'relayer' } }
```

### Operations Events

```ts
// Operation created or updated
{ type: 'operations:update', payload: { action: 'create' | 'update'; operationId?: string; operation?: StoredOperation } }
```

### Debug Events

```ts
// Debug information
{ type: 'debug', payload: { scope: string; message: string; detail?: unknown } }
```

## Error Handling

Errors are emitted as events with the `error` type:

```ts
{
  type: 'error',
  payload: {
    code: SdkErrorCode,
    message: string,
    detail?: unknown,
    cause?: unknown,
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `CONFIG` | Invalid SDK configuration |
| `ASSETS` | WASM/circuit loading failure |
| `STORAGE` | Storage adapter error |
| `SYNC` | Entry/Merkle sync failure |
| `CRYPTO` | Cryptographic operation failure |
| `MERKLE` | Merkle proof failure |
| `WITNESS` | Witness construction failure |
| `PROOF` | zk-SNARK proof generation failure |
| `RELAYER` | Relayer communication failure |

### Example Error Handling

```ts
const sdk = createSdk({
  chains: [...],
  onEvent: (event) => {
    if (event.type === 'error') {
      const { code, message, detail } = event.payload;
      switch (code) {
        case 'SYNC':
          console.warn('Sync failed, will retry:', message);
          break;
        case 'PROOF':
          console.error('Proof generation failed:', message);
          break;
        case 'RELAYER':
          console.error('Relayer error:', message, detail);
          break;
        default:
          console.error(`[${code}]`, message);
      }
    }
  },
});
```

## Event-Driven UI Pattern

```ts
const sdk = createSdk({
  chains: [...],
  onEvent: (event) => {
    switch (event.type) {
      case 'core:progress':
        updateLoadingBar(event.payload.loaded, event.payload.total);
        break;
      case 'core:ready':
        showReadyState();
        break;
      case 'sync:progress':
        updateSyncProgress(event.payload);
        break;
      case 'zkp:start':
        showProvingSpinner();
        break;
      case 'zkp:done':
        hideProvingSpinner();
        break;
      case 'wallet:utxo:update':
        refreshBalance();
        break;
    }
  },
});
```
