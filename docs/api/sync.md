# Sync

The sync module synchronizes on-chain state (memos, nullifiers, Merkle tree) with the local store.

## `sync.syncOnce(options?)`

Performs a single sync pass.

```ts
await sdk.sync.syncOnce();

// With options
await sdk.sync.syncOnce({
  chainIds: [11155111],
  resources: ['memo', 'nullifier', 'merkle'],
  signal: abortController.signal,
  requestTimeoutMs: 30_000,
  pageSize: 1024,
  continueOnError: true,
});
```

### Parameters

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `chainIds` | `number[]?` | all | Chains to sync |
| `resources` | `string[]?` | all | `'memo'`, `'nullifier'`, `'merkle'` |
| `signal` | `AbortSignal?` | — | Cancellation signal |
| `requestTimeoutMs` | `number?` | from config | HTTP timeout |
| `pageSize` | `number?` | from config | Entries per page |
| `continueOnError` | `boolean?` | `false` | Skip failed chains |

## `sync.start(options?)`

Starts background polling.

```ts
await sdk.sync.start({
  chainIds: [11155111],
  pollMs: 10_000,
});
```

Performs an initial `syncOnce`, then polls at the specified interval.

### Parameters

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `chainIds` | `number[]?` | all | Chains to sync |
| `pollMs` | `number?` | from config | Poll interval in ms |

## `sync.stop()`

Stops background polling and aborts any in-flight sync.

```ts
sdk.sync.stop();
```

## `sync.getStatus()`

Returns current sync status for each chain.

```ts
const status = sdk.sync.getStatus();
// {
//   11155111: {
//     memo: { status: 'synced', downloaded: 1291 },
//     nullifier: { status: 'synced', downloaded: 80 },
//     merkle: { status: 'synced', cursor: 42 },
//   }
// }
```

### Status values

Each resource has a `status` field:

| Status | Description |
|--------|-------------|
| `'idle'` | Not yet synced |
| `'syncing'` | Currently syncing |
| `'synced'` | Up to date |
| `'error'` | Failed (check `errorMessage`) |
