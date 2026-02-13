# 快速开始

## 安装

```bash
# pnpm（推荐）
pnpm add @ocash/sdk

# npm
npm install @ocash/sdk

# yarn
yarn add @ocash/sdk
```

## 入口点

SDK 提供三个入口点，适用于不同环境：

| 导入路径             | 环境    | 存储适配器            |
| -------------------- | ------- | --------------------- |
| `@ocash/sdk`         | 通用    | `MemoryStore`（默认） |
| `@ocash/sdk/browser` | 浏览器  | `IndexedDbStore`      |
| `@ocash/sdk/node`    | Node.js | `FileStore`           |

```ts
// 通用（任何环境）
import { createSdk } from '@ocash/sdk';

// 浏览器（包含 IndexedDbStore）
import { createSdk, IndexedDbStore } from '@ocash/sdk/browser';

// Node.js（包含 FileStore）
import { createSdk, FileStore } from '@ocash/sdk/node';
```

## 快速示例

```ts
import { createSdk } from '@ocash/sdk';

// 1. 创建 SDK 实例
const sdk = createSdk({
  chains: [
    {
      chainId: 11155111,
      entryUrl: 'https://entry.example.com',
      ocashContractAddress: '0x...',
      relayerUrl: 'https://relayer.example.com',
      merkleProofUrl: 'https://merkle.example.com',
      tokens: [],
    },
  ],
  onEvent: (event) => console.log(event.type, event.payload),
});

// 2. 加载 WASM 和电路
await sdk.core.ready();

// 3. 打开钱包会话
await sdk.wallet.open({ seed: 'your-secret-seed-phrase' });

// 4. 同步链上状态
await sdk.sync.syncOnce();

// 5. 查询余额
const balance = await sdk.wallet.getBalance({ chainId, assetId });
console.log('余额:', balance);

// 6. 清理
await sdk.wallet.close();
```

## 生命周期

推荐的集成顺序：

```
createSdk(config)           → 初始化 SDK
  ↓
sdk.core.ready()            → 加载 WASM 和电路文件
  ↓
sdk.wallet.open({ seed })   → 派生密钥，打开存储
  ↓
sdk.sync.syncOnce()         → 获取 memo、nullifier、merkle 状态
  或 sdk.sync.start()       → 后台轮询
  ↓
sdk.planner / sdk.ops       → 规划并执行操作
  ↓
sdk.wallet.close()          → 释放密钥，刷新存储
```

## 环境要求

- **Node.js**: >= 20.19.0（原生 `fetch` + `WebAssembly`）
- **浏览器**: 支持 `WebAssembly`、`crypto.getRandomValues`、`fetch` 的现代浏览器
- **pnpm**: >= 9.0.0（参与开发时需要）

## 下一步

- [配置](./configuration) — SDK 选项详解
- [架构](./architecture) — 了解模块系统
- [充值](./deposit) — 将代币存入隐私池
