# @ocash/sdk

OCash ZKP SDK 的 TypeScript 版本，面向浏览器 / 混合容器 / Node 环境提供统一 API：

- `createSdk(config)`：返回 headless SDK 的顶层模块集合
- `core.ready()`：自动加载 Go wasm、transfer/withdraw 电路并派发事件
- `assets`：链/Token/relayer 配置读取与 relayer config 同步
- `storage`：持久化适配器（默认内存存储；可由宿主注入）
- `wallet`：钱包会话（seed -> viewing address），UTXO/余额查询与 spent 标记
- `sync`：memo/nullifier 同步基于 Entry Service（需要 `chain.entryUrl`）；merkle 同步用于更新链上 merkle “head”（需要 `chain.merkleProofUrl`）
- `zkp`：witness/proof 生成（调用 wasm）
- `planner`：交易规划（选币/找零/fee/proof binding/extraData），并计算合并次数与手续费汇总
- `tx`：构建 relayer 请求体（transfer/burn）
- `ops`：端到端编排（plan → merkle proof → witness → proof → relayer request）

## 构建

```bash
pnpm install
pnpm --filter @ocash/sdk build
```

## M1：资产产出 / 托管 / 集成（集成就绪）

SDK 本体不内置 wasm/电路文件；宿主必须提供这些运行时资产（`wasm_exec.js`、`app.wasm`、`transfer.r1cs/pk`、`withdraw.r1cs/pk`）。
推荐做法是把资产发布到 CDN，并提供一份 `manifest.json`（包含切片信息与 sha256），然后在宿主侧从 manifest 生成 `assetsOverride + assetsIntegrity`。

### 资产构建（离线/本地）

如果你已经有本地的 `app.wasm/transfer*/withdraw*/wasm_exec.js`，可以用离线模式生成 `client/packages/sdk/assets/manifest.json`（并将大文件自动切片）：

```bash
LOCAL_ASSETS_DIR=/absolute/path/to/wasm-and-circuits pnpm --filter @ocash/sdk build:assets:local
```

生成目录：

- `client/packages/sdk/assets/manifest.json`
- `client/packages/sdk/assets/<hashed files or shard dirs>`

## 最小用法（示例）

```ts
const sdk = createSdk({
  chains: [
    {
      chainId: 11155111,
      entryUrl: 'https://entry.example.com',
      ocashContractAddress: '0x0000000000000000000000000000000000000000',
      relayerUrl: 'https://relayer.example.com',
      tokens: [],
    },
  ],
  assetsOverride: {
    'wasm_exec.js': 'https://cdn.example.com/ocash/wasm_exec.js',
    'app.wasm': 'https://cdn.example.com/ocash/app.wasm',
    'transfer.r1cs': 'https://cdn.example.com/ocash/transfer.r1cs',
    'transfer.pk': 'https://cdn.example.com/ocash/transfer.pk',
    'withdraw.r1cs': 'https://cdn.example.com/ocash/withdraw.r1cs',
    'withdraw.pk': 'https://cdn.example.com/ocash/withdraw.pk',
  },
  onEvent: console.log,
});

await sdk.core.ready();
await sdk.wallet.open({ seed: '...' });
await sdk.sync.syncOnce();
const balance = await sdk.wallet.getBalance({ chainId: 11155111 });
```

## 推荐生命周期（宿主集成顺序）

- 初始化：`const sdk = createSdk(...)`
- 资源就绪：`await sdk.core.ready()`
- 打开钱包会话：`await sdk.wallet.open({ seed, accountNonce })`
- 同步链上视图：`await sdk.sync.syncOnce()` 或 `await sdk.sync.start()`
- 发起操作：`sdk.planner`/`sdk.ops`/`sdk.tx`（依业务选择）
- 退出：`await sdk.wallet.close()`（触发 store 的 `close()` 并等待落盘）

## Ops（端到端 transfer/withdraw）

`ops` 会把 demo 里常见的流程收敛成一条链路：`plan → merkle proof → witness → prove → relayer request`。

```ts
const owner = sdk.keys.deriveKeyPair(seed, nonce);
const prepared = await sdk.ops.prepareTransfer({
  chainId,
  assetId: tokenId,
  amount,
  to: viewingAddress,
  ownerKeyPair: owner,
  publicClient, // viem PublicClient
});
// prepared.plan.feeSummary -> { mergeCount, relayerFeeTotal, protocolFeeTotal, ... }

// relayer 提交 + 轮询 txhash
const submit = await sdk.ops.submitRelayerRequest({ prepared, publicClient });
const chainTxHash = await submit.waitRelayerTxHash;
const receipt = await submit.TransactionReceipt;
```

## Planner（合并次数/最大可转出）

`planner.estimate` 与 `planner.plan` 会附带 `feeSummary/maxSummary`：

- `feeSummary.mergeCount`：本次操作所需合并次数（>3 UTXO 会触发合并）
- `feeSummary.relayerFeeTotal`：总 relayer fee（合并步骤 + 最终操作）
- `maxSummary.outputAmount`：当前余额可转出的最大值（扣除费用）

如需单独获取最大可转出，使用 `planner.estimateMax`。

## Ops（deposit）

deposit 走链上 `App.deposit`；`prepareDeposit` 会计算 protocol fee、读取 `depositRelayerFee`，并在 ERC20 场景下给出 `approve` 请求。
同时 SDK 会把 `recordOpening` 加密为 `memo`（`bytes`）并填入 `depositRequest.args[4]`，用于后续钱包同步/解密。

```ts
const ownerPub = sdk.keys.getPublicKeyBySeed(seed, nonce);
const prepared = await sdk.ops.prepareDeposit({
  chainId,
  assetId: tokenId,
  amount,
  ownerPublicKey: ownerPub,
  account: account.address, // EVM account
  publicClient,
});

if (prepared.approveNeeded && prepared.approveRequest) {
  await walletClient.writeContract(prepared.approveRequest);
}
await walletClient.writeContract(prepared.depositRequest);
```

## 运行时资源 - `assetsOverride`

使用 `assetsOverride` 提供 wasm/电路文件的完整 URL 或分片列表，SDK 会按顺序下载并拼接。传入分片数组即可
复用浏览器缓存与断点续传能力（例如 `00/01/...` 顺序的分片）。

```ts
const sdk = createSdk({
  chains: [...],
  assetsOverride: {
    // 直接指定完整 URL
    'app.wasm': 'https://cdn.example.com/ocash/app.wasm',
    'wasm_exec.js': 'https://cdn.example.com/ocash/wasm_exec.js',
    // 分片：显式列出每个分片路径，可复用浏览器缓存
    'transfer.pk': [
      'https://cdn.example.com/ocash/transfer_pk_8_xxx/00',
      'https://cdn.example.com/ocash/transfer_pk_8_xxx/01',
      // ...
    ],
  },
});
```

所有必需文件（`wasm_exec.js`、`app.wasm`、`transfer.r1cs/pk`、`withdraw.r1cs/pk`）都需要显式配置；
若提供分片数组则每个片段都能被浏览器独立缓存，带来更好的大文件加载体验。

### Node/Hybrid 本地文件（可选）

在 Node（或 hybrid 且可用 `node:fs`）环境下，`assetsOverride` 除了 HTTP(S) URL 外，也可以传入本地文件路径或 `file://` URL：

```ts
const sdk = createSdk({
  chains: [...],
  runtime: 'node',
  assetsOverride: {
    'wasm_exec.js': './assets/wasm_exec.js',
    'app.wasm': './assets/app.wasm',
    'transfer.r1cs': './assets/transfer.r1cs',
    'transfer.pk': './assets/transfer.pk',
    'withdraw.r1cs': './assets/withdraw.r1cs',
    'withdraw.pk': './assets/withdraw.pk',
  },
});
```

#### 使用 manifest 生成 `assetsOverride`（推荐）

配合 `pnpm --filter @ocash/sdk build:assets` 生成 `client/packages/sdk/assets/manifest.json`（脚本会把大文件切片并写入 sha256），
宿主可以直接从 manifest 构造 `assetsOverride + assetsIntegrity`：

```ts
import { createSdk } from '@ocash/sdk';
import { loadAssetsFromManifestSync } from '@ocash/sdk/node';

const { assetsOverride, assetsIntegrity } = loadAssetsFromManifestSync({
  manifestPath: './client/packages/sdk/assets/manifest.json',
});

const sdk = createSdk({
  chains: [...],
  runtime: 'node',
  assetsOverride,
  assetsIntegrity, // 可选：开启 sha256 校验
});
```

浏览器/混合容器可直接从 `manifest.json` 的 URL 获取并生成配置：

```ts
import { createSdk, loadAssetsFromManifestUrl } from '@ocash/sdk';

const { assetsOverride, assetsIntegrity } = await loadAssetsFromManifestUrl({
  manifestUrl: 'https://cdn.example.com/ocash/manifest.json',
});

const sdk = createSdk({ chains: [...], runtime: 'browser', assetsOverride, assetsIntegrity });
```

Node 20+ 需要原生 `fetch/WebAssembly` 支持；混合容器请确保 `globalThis.crypto.getRandomValues` 可用。

### Node 最小可运行示例

先生成本地 manifest（见上面的“离线/本地”），再构建 SDK 并运行示例：

```bash
pnpm --filter @ocash/sdk build
node client/packages/sdk/examples/node-minimal.js
```

### runtime 选择

- `runtime: 'browser'`：按浏览器环境处理（相对 URL 会用 `window.location.origin` 补全；不启用本地文件缓存）
- `runtime: 'node'`：按 Node 环境处理（资源 URL 需为绝对地址；启用 `cacheDir` 本地文件缓存）
- `runtime: 'hybrid'`：面向 Electron/Tauri 等混合容器（相对 URL 按浏览器补全；同时在可用时启用 `cacheDir` 本地缓存）

在 WebWorker 等无 `window` 的环境中，SDK 会使用 `globalThis.location.origin` 来补全相对 URL（建议显式设置 `runtime: 'browser'` 或 `runtime: 'hybrid'`）。

`cacheDir` 会把通过 HTTP(S) 拉取的运行时资产（包括 `wasm_exec.js`、`app.wasm`、`*.r1cs`、`*.pk` 以及分片）落盘缓存，避免每次启动都重新下载。

### sync 参数调优

可通过 `createSdk({ sync: { pollMs, pageSize, requestTimeoutMs } })` 设置默认同步参数；也可以在 `sync.start({ pollMs })` / `sync.syncOnce({ pageSize, requestTimeoutMs })` 覆盖单次行为。

#### sync 重试与退避（可选）

对于不稳定网络，可以开启请求重试；对于连续失败的链，可以开启 per-chain backoff（默认关闭）：

```ts
const sdk = createSdk({
  chains: [...],
  sync: {
    requestTimeoutMs: 20_000,
    retry: { attempts: 3, baseDelayMs: 250, maxDelayMs: 5_000 },
    backoff: { enabled: true, baseMs: 15_000, maxMs: 120_000 },
  },
});
```

## 事件与错误码

- 所有事件通过 `onEvent` 回调派发；错误使用 `{ type: 'error', payload: { code, message, detail, cause } }`
- `code`（`SdkErrorCode`）包括：`CONFIG`/`ASSETS`/`STORAGE`/`SYNC`/`CRYPTO`/`MERKLE`/`WITNESS`/`PROOF`/`RELAYER`

## Store（Storage + 操作记录/历史）

SDK 提供一体化的 `StorageAdapter`：UTXO/sync cursor 等钱包状态 + deposit/transfer/withdraw 等业务操作记录

`wallet.open()` 会调用 `storage.init({ walletId })`，其中 `walletId` 默认是 viewing address（由 seed 派生）。
同一个 store 实例切换到不同 `walletId` 时会切换命名空间，并清空当前进程内缓存状态，避免不同钱包之间的数据串用；持久化实现（如 `FileStore`/`KeyValueStore`）则会按 walletId 使用不同的存储 key/file。

持久化 store 内部会串行化写入，避免 `createOperation/updateOperation` 触发的并发保存导致状态回退；`close()` 会等待所有挂起写入完成。

内置实现：

- `MemoryStore`（通用）
- `KeyValueStore` / `RedisStore` / `SqliteStore`（通用）
- `FileStore`（Node）：从 `@ocash/sdk/node` 导入
- `IndexedDbStore`（Browser）：从 `@ocash/sdk/browser` 导入

### Entry/Merkle 缓存（可选）

对齐 `client/app` 的数据库结构，`StorageAdapter` 还支持可选的原始 Entry 数据缓存与 Merkle 元数据：

- `upsertEntryMemos` / `listEntryMemos`：缓存 EntryService 的 memo 页面数据（cid/commitment/memo/createdAt）
- `upsertEntryNullifiers` / `listEntryNullifiers`：缓存 EntryService 的 nullifier 数据
- `getMerkleTree` / `setMerkleTree`：缓存“已合并到主树”的 Merkle 元数据（root/totalElements/lastUpdated）

这些接口为 best-effort：SDK 同步与 proof 流程不强依赖它们，但实现后可用于调试、导出、以及更接近 app 的本地数据视图。

### operations 治理（可选）

长时间运行的应用建议为持久化 store 设置 `maxOperations`，避免操作历史无限增长；也可使用可选治理方法做清理：

- `deleteOperation(id)`：删除单条记录
- `clearOperations()`：清空历史
- `pruneOperations({ max })`：保留最新 N 条

### 操作记录

```ts
const submit = await sdk.ops.submitRelayerRequest({ prepared, publicClient });
const chainTxHash = await submit.waitRelayerTxHash;
const receipt = await submit.TransactionReceipt;
```

### 操作记录查询（过滤/分页）

`listOperations` 支持传入数字 `limit`（兼容旧用法），也支持 query 对象：

```ts
const ops = store.listOperations({
  chainId,
  tokenId,
  type: 'transfer',
  status: 'submitted',
  limit: 20,
  offset: 0,
  sort: 'desc',
});
```

## Demo

- Node.js 可运行 demo：`client/packages/sdk-node-demo/README.md:1`
