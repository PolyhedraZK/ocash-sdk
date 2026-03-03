# 浏览器集成

如何在浏览器应用中使用 Vite 集成 `@ocash/sdk`。

## 入口点

使用 `@ocash/sdk/browser` — 它重新导出通用入口的所有内容，并额外提供 `IndexedDbStore` 用于浏览器持久化存储。

```ts
import { createSdk, IndexedDbStore } from '@ocash/sdk/browser';
```

`KeyValueStore`、`RedisStore` 和 `SqliteStore` **不包含**在浏览器包中，它们在 `@ocash/sdk/node` 中。

## Vite 配置

无需特殊插件或变通方案。最小 `vite.config.ts`：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
});
```

## 运行时资源

SDK 通过 `core.ready()` 在运行时加载 WASM 和电路文件。默认从内置 CDN URL 获取。如需覆盖：

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

如果省略 `assetsOverride`，SDK 使用默认 URL。**不支持**部分覆盖 — 要么提供全部六个资源，要么不提供。

## IndexedDbStore

用于跨页面刷新的持久化存储：

```ts
const store = new IndexedDbStore({
  dbName: 'myapp',          // 默认: 'ocash_sdk'
  storeName: 'ocash_store', // 默认: 'ocash_store'
  maxOperations: 200,
});
```

## 完整示例

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

// 加载 WASM 和电路
await sdk.core.ready();

// 打开钱包
await sdk.wallet.open({ seed: 'your-secret-seed-phrase' });

// 同步链上状态
await sdk.sync.syncOnce();

// 查询余额
const balance = await sdk.wallet.getBalance({
  chainId: 11155111,
  assetId: 'your-token-id',
});
console.log('余额:', balance);

// 清理
await sdk.wallet.close();
```
