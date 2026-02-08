# Storage

## StorageAdapter Interface

The SDK uses a `StorageAdapter` interface for all persistence. See the [Storage Adapters guide](../guide/storage) for usage patterns.

## Required Methods

### `upsertUtxos(utxos)`

```ts
upsertUtxos(utxos: UtxoRecord[]): Promise<void>
```

Inserts or updates UTXOs. Keyed by `chainId` + `commitment`.

### `listUtxos(query?)`

```ts
listUtxos(query?: ListUtxosQuery): Promise<{ total: number; rows: UtxoRecord[] }>
```

Lists UTXOs with optional filtering, pagination, and sorting.

### `markSpent(input)`

```ts
markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<number>
```

Marks UTXOs as spent by nullifier. Returns count of updated records.

### `getSyncCursor(chainId)`

```ts
getSyncCursor(chainId: number): Promise<SyncCursor | undefined>
```

Gets the last sync position for a chain.

### `setSyncCursor(chainId, cursor)`

```ts
setSyncCursor(chainId: number, cursor: SyncCursor): Promise<void>
```

Persists the sync position for a chain.

## Built-in Adapters

### MemoryStore

```ts
import { MemoryStore } from '@ocash/sdk';
new MemoryStore(options?: { maxOperations?: number })
```

### IndexedDbStore

```ts
import { IndexedDbStore } from '@ocash/sdk/browser';
new IndexedDbStore(options?: {
  dbName?: string;
  storeName?: string;
  indexedDb?: IDBFactory;
  maxOperations?: number;
})
```

### FileStore

```ts
import { FileStore } from '@ocash/sdk/node';
new FileStore(options: {
  baseDir: string;
  maxOperations?: number;
})
```

### KeyValueStore / RedisStore / SqliteStore

```ts
import { KeyValueStore, RedisStore, SqliteStore } from '@ocash/sdk';

new RedisStore(options: { url: string; ... })
new SqliteStore(options: { filename: string; ... })
new KeyValueStore(options: { client: KeyValueClient; ... })
```
