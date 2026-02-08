# 存储适配器

SDK 使用 `StorageAdapter` 接口进行所有持久化操作。你可以使用内置适配器或实现自定义适配器。

## 内置适配器

### MemoryStore

内存存储。未提供 `storage` 时的默认选项。页面刷新或进程退出后数据丢失。

```ts
import { MemoryStore } from '@ocash/sdk';

const sdk = createSdk({
  chains: [...],
  storage: new MemoryStore({ maxOperations: 100 }),
});
```

### IndexedDbStore（浏览器）

使用 IndexedDB 的持久化浏览器存储。从 `@ocash/sdk/browser` 导入：

```ts
import { createSdk, IndexedDbStore } from '@ocash/sdk/browser';

const sdk = createSdk({
  chains: [...],
  storage: new IndexedDbStore({
    dbName: 'myapp',
    maxOperations: 200,
  }),
});
```

### FileStore（Node.js）

基于 JSON 文件的存储。从 `@ocash/sdk/node` 导入：

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

### KeyValueStore / RedisStore / SqliteStore

```ts
import { RedisStore, SqliteStore } from '@ocash/sdk';

const redisStore = new RedisStore({ url: 'redis://localhost:6379' });
const sqliteStore = new SqliteStore({ filename: './data.db' });
```

## 自定义适配器

实现 `StorageAdapter` 接口即可对接任何后端：

```ts
class MyCustomStore implements StorageAdapter {
  async upsertUtxos(utxos: UtxoRecord[]) { /* ... */ }
  async listUtxos(query?: ListUtxosQuery) { /* ... */ }
  async markSpent(input: { chainId: number; nullifiers: Hex[] }) { /* ... */ }
  async getSyncCursor(chainId: number) { /* ... */ }
  async setSyncCursor(chainId: number, cursor: SyncCursor) { /* ... */ }
}
```

只需实现五个必需方法。可选方法（操作记录、Merkle 缓存、entry 数据缓存）可按需添加。
