# Storage

## StorageAdapter 接口

SDK 使用 `StorageAdapter` 接口进行所有持久化。详见[存储适配器指南](../guide/storage)。

## 必需方法

```ts
interface StorageAdapter {
  upsertUtxos(utxos: UtxoRecord[]): Promise<void>;
  listUtxos(query?: ListUtxosQuery): Promise<{ total: number; rows: UtxoRecord[] }>;
  markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<number>;
  getSyncCursor(chainId: number): Promise<SyncCursor | undefined>;
  setSyncCursor(chainId: number, cursor: SyncCursor): Promise<void>;
}
```

## 内置适配器

| 适配器 | 环境 | 导入路径 |
|--------|------|---------|
| `MemoryStore` | 通用 | `@ocash/sdk` |
| `IndexedDbStore` | 浏览器 | `@ocash/sdk/browser` |
| `FileStore` | Node.js | `@ocash/sdk/node` |
| `KeyValueStore` | 通用 | `@ocash/sdk` |
| `RedisStore` | 通用 | `@ocash/sdk` |
| `SqliteStore` | 通用 | `@ocash/sdk` |
