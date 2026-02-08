# 配置

`createSdk(config)` 工厂函数接受一个 `OCashSdkConfig` 对象：

```ts
import { createSdk } from '@ocash/sdk';

const sdk = createSdk({
  chains: [...],
  assetsOverride: {...},
  storage: myStore,
  runtime: 'browser',
  sync: { pollMs: 15000 },
  onEvent: (event) => { ... },
});
```

## `chains`

必填。链配置数组：

```ts
interface ChainConfigInput {
  chainId: number;              // EVM 链 ID
  rpcUrl?: string;              // JSON-RPC URL（用于链上读取）
  entryUrl?: string;            // Entry Service URL（memo/nullifier 同步）
  ocashContractAddress?: string; // OCash 合约地址
  relayerUrl?: string;          // Relayer 服务 URL
  merkleProofUrl?: string;      // Merkle 证明服务 URL
  tokens?: TokenMetadata[];     // 代币配置
}
```

每条链必须有唯一的 `chainId`。SDK 支持多链配置。

## `assetsOverride`

可选。覆盖 WASM 和电路文件的 URL：

```ts
const sdk = createSdk({
  chains: [...],
  assetsOverride: {
    'wasm_exec.js': 'https://cdn.example.com/wasm_exec.js',
    'app.wasm': 'https://cdn.example.com/app.wasm',
    'transfer.r1cs': 'https://cdn.example.com/transfer.r1cs',
    'transfer.pk': 'https://cdn.example.com/transfer.pk',
    'withdraw.r1cs': 'https://cdn.example.com/withdraw.r1cs',
    'withdraw.pk': 'https://cdn.example.com/withdraw.pk',
  },
});
```

提供 `assetsOverride` 时，**所有**必需文件都必须指定。

### 分片加载

对于大文件，提供分片 URL 数组以支持并行/断点续传加载：

```ts
assetsOverride: {
  'transfer.pk': [
    'https://cdn.example.com/transfer_pk/00',
    'https://cdn.example.com/transfer_pk/01',
    'https://cdn.example.com/transfer_pk/02',
  ],
}
```

### 本地文件（Node.js）

在 Node.js 或混合环境中可以使用本地路径：

```ts
assetsOverride: {
  'wasm_exec.js': './assets/wasm_exec.js',
  'app.wasm': './assets/app.wasm',
}
```

## `runtime`

可选。运行时环境提示：

| 值 | 说明 |
|---|------|
| `'auto'` | 自动检测（默认） |
| `'browser'` | 浏览器环境 |
| `'node'` | Node.js 环境 |
| `'hybrid'` | Electron/Tauri 混合容器 |

## `storage`

可选。自定义 `StorageAdapter` 实例。默认为 `MemoryStore`。

详见[存储适配器](./storage)。

## `sync`

可选。默认同步参数：

```ts
sync: {
  pageSize: 512,            // 每页条目数（默认：512）
  pollMs: 15_000,           // 后台轮询间隔（默认：15s）
  requestTimeoutMs: 20_000, // HTTP 超时（默认：20s）
  retry: {                  // 重试策略（可选）
    attempts: 3,
    baseDelayMs: 250,
    maxDelayMs: 5_000,
  },
}
```

## `onEvent`

可选。SDK 事件回调：

```ts
onEvent: (event) => {
  switch (event.type) {
    case 'core:ready':
      console.log('SDK 就绪，耗时', event.payload.durationMs, 'ms');
      break;
    case 'error':
      console.error(event.payload.code, event.payload.message);
      break;
  }
}
```

详见[事件与错误](./events)。
