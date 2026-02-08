# Storage Adapters

The SDK uses a `StorageAdapter` interface for all persistence. You can use a built-in adapter or implement your own.

## Built-in Adapters

### MemoryStore

In-memory storage. Default when no `storage` is provided. Data is lost on page reload / process exit.

```ts
import { MemoryStore } from '@ocash/sdk';

const sdk = createSdk({
  chains: [...],
  storage: new MemoryStore({ maxOperations: 100 }),
});
```

### IndexedDbStore (Browser)

Persistent browser storage using IndexedDB. Import from `@ocash/sdk/browser`:

```ts
import { createSdk, IndexedDbStore } from '@ocash/sdk/browser';

const sdk = createSdk({
  chains: [...],
  storage: new IndexedDbStore({
    dbName: 'myapp',          // Default: 'ocash_sdk'
    storeName: 'ocash_store', // Default: 'ocash_store'
    maxOperations: 200,
  }),
});
```

### FileStore (Node.js)

JSON file-based storage. Import from `@ocash/sdk/node`:

```ts
import { createSdk, FileStore } from '@ocash/sdk/node';

const sdk = createSdk({
  chains: [...],
  storage: new FileStore({
    baseDir: './data',
    maxOperations: 500,
  }),
});
```

Files are stored as `{baseDir}/{walletId}.store.json`.

### KeyValueStore

Wraps any key-value client (Redis, SQLite, custom):

```ts
import { KeyValueStore, RedisStore, SqliteStore } from '@ocash/sdk';

// Redis
const redisStore = new RedisStore({ url: 'redis://localhost:6379' });

// SQLite
const sqliteStore = new SqliteStore({ filename: './data.db' });

// Generic KV
const kvStore = new KeyValueStore({
  client: myKvClient, // implements get/set/del
});
```

## StorageAdapter Interface

Required methods:

```ts
interface StorageAdapter {
  // UTXO management
  upsertUtxos(utxos: UtxoRecord[]): Promise<void>;
  listUtxos(query?: ListUtxosQuery): Promise<{ total: number; rows: UtxoRecord[] }>;
  markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<number>;

  // Sync cursors
  getSyncCursor(chainId: number): Promise<SyncCursor | undefined>;
  setSyncCursor(chainId: number, cursor: SyncCursor): Promise<void>;

  // Lifecycle (optional)
  init?(options?: { walletId?: string }): Promise<void> | void;
  close?(): Promise<void> | void;
}
```

Optional methods for enhanced functionality:

```ts
interface StorageAdapter {
  // ... required methods above

  // Operations history
  createOperation?<T extends OperationType>(input: ...): StoredOperation;
  updateOperation?(id: string, patch: Partial<StoredOperation>): void;
  listOperations?(input?: number | ListOperationsQuery): StoredOperation[];
  deleteOperation?(id: string): boolean;
  clearOperations?(): void;
  pruneOperations?(options?: { max?: number }): number;

  // Merkle tree state
  getMerkleTree?(chainId: number): Promise<MerkleTreeState | undefined>;
  setMerkleTree?(chainId: number, tree: MerkleTreeState): Promise<void>;
  getMerkleLeaves?(chainId: number): Promise<Array<{ cid: number; commitment: Hex }>>;
  appendMerkleLeaves?(chainId: number, leaves: ...): Promise<void>;
  getMerkleNode?(chainId: number, id: string): Promise<MerkleNodeRecord | undefined>;
  upsertMerkleNodes?(chainId: number, nodes: MerkleNodeRecord[]): Promise<void>;

  // Entry data cache
  upsertEntryMemos?(memos: EntryMemoRecord[]): Promise<number>;
  listEntryMemos?(query: ListEntryMemosQuery): Promise<{ total; rows }>;
  upsertEntryNullifiers?(nullifiers: EntryNullifierRecord[]): Promise<number>;
  listEntryNullifiers?(query: ...): Promise<{ total; rows }>;
}
```

## Wallet Scoping

When `wallet.open({ seed })` is called, the storage is initialized with a `walletId` derived from the seed. This ensures different wallets use separate namespaces.

Switching wallets (calling `close()` then `open()` with a different seed) clears in-memory state and switches the storage namespace.

## Operations Governance

For long-running applications, use `maxOperations` to cap history size:

```ts
const store = new FileStore({
  baseDir: './data',
  maxOperations: 200,  // Auto-prune oldest records
});

// Manual cleanup
store.pruneOperations({ max: 100 });
store.deleteOperation('op-123');
store.clearOperations();
```

## Custom Adapter

Implement the `StorageAdapter` interface for any backend:

```ts
class MyCustomStore implements StorageAdapter {
  async upsertUtxos(utxos: UtxoRecord[]) { /* ... */ }
  async listUtxos(query?: ListUtxosQuery) { /* ... */ }
  async markSpent(input: { chainId: number; nullifiers: Hex[] }) { /* ... */ }
  async getSyncCursor(chainId: number) { /* ... */ }
  async setSyncCursor(chainId: number, cursor: SyncCursor) { /* ... */ }
}
```

Only the five required methods need to be implemented. Optional methods enable additional features (operation history, Merkle caching, entry data caching) but are not required for basic functionality.
