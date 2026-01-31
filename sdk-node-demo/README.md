# @ocash/sdk Node.js demo

一个可直接跑的 Node.js demo 集合，覆盖：

- 初始化与 wasm 加载进度
- 数据同步（memos/nullifiers）
- Merkle tree 构建进度监听（合约事件 `ArrayMergedToTree`）
- 资产/relayer 配置查询
- deposit / transfer / withdraw（含 relayer 提交与 txhash 轮询）
- 查询余额 / balance details（UTXO 列表）
- 查询操作记录（demo 本地持久化）

## 运行

先构建 SDK（生成 `client/packages/sdk/dist`），再运行 demo：

```bash
pnpm --filter @ocash/sdk build
pnpm --filter @ocash/sdk-node-demo dev -- --help
```

如需跳过 `tsc`（更快的热运行）可用：

```bash
pnpm --filter @ocash/sdk-node-demo dev:tsx -- --help
```

注意：`@ocash/sdk-node-demo` 通过 `workspace:*` 依赖 `@ocash/sdk`，Node 会加载 `client/packages/sdk/dist`。如果你改了 SDK 源码（比如 witness JSON 结构），需要先跑一遍 `pnpm --filter @ocash/sdk build`；`dev`/`dev:tsx`/`start` 已内置这个步骤。

## 配置

复制示例配置并修改（默认读取当前工作目录下的 `./ocash.config.json`；可用 `--config` 指定路径）：

```bash
cp client/packages/sdk-node-demo/ocash.config.example.json client/packages/sdk-node-demo/ocash.config.json
```

建议配置项：

- `seed`：用于 viewing address 与解密 memo
- `chains[].rpcUrl`：链上读写（deposit 需要 signer）
- `chains[].entryUrl`：memos/nullifiers 同步
- `chains[].relayerUrl`：transfer/withdraw 提交
- `chains[].merkleProofUrl`：Merkle proof 获取（remote proof server）
- `assetsOverride`：wasm / r1cs / pk 等资源 URL

deposit 需要 signer 私钥（建议只在本地 demo 使用）：

- `ocash.config.json` 里设置 `signerPrivateKey`，或运行时传 `--privateKey 0x...`
- 也可设置环境变量：`OCASH_DEMO_PRIVATE_KEY=0x...`

demo 会把本地数据写到 `client/packages/sdk-node-demo/.ocash-demo/`（已加入 `.gitignore`）。

注意：部分 RPC（如 `rpc.ankr.com`）需要 API Key 才能调用 `eth_chainId`/合约读写。若遇到 `Unauthorized`，请把 `chains[].rpcUrl` 换成带 key 的地址（例如 `https://rpc.ankr.com/eth_sepolia/<ANKR_API_KEY>`）或换用其它可用的 Sepolia RPC。

## Demo 命令

通用：

```bash
pnpm --filter @ocash/sdk-node-demo dev -- init
pnpm --filter @ocash/sdk-node-demo dev -- sync
pnpm --filter @ocash/sdk-node-demo dev -- demoAll
pnpm --filter @ocash/sdk-node-demo dev -- assets --relayerConfig
pnpm --filter @ocash/sdk-node-demo dev -- balance
pnpm --filter @ocash/sdk-node-demo dev -- balance-details
pnpm --filter @ocash/sdk-node-demo dev -- history --limit 50
pnpm --filter @ocash/sdk-node-demo dev -- merkle-listen
```

`demoAll` 会启动完整流程（后台进程负责初始化 SDK / 背景同步 memos+nullifiers / 监听 `ArrayMergedToTree` / 构建本地 Merkle），并在前台提供一个交互式命令行界面（避免后台日志打断输入）：

- `assets` / `balance` / `balance-details` / `history`
- `transfer`（交互输入 `token` / `amount` / `to`，`to` 为空默认转给自己）
- `withdraw`（交互输入 `token` / `amount` / `recipient`）
- `logs`（查看后台 sync/sdk/合约事件日志）

`merkle-listen` 可选参数：

- `--ms <number>`：监听 N 毫秒后自动停止

业务：

```bash
# deposit
pnpm --filter @ocash/sdk-node-demo dev -- deposit --token SepoliaETH --amount 0.001

# transfer（--to 是 OCash viewing address）
pnpm --filter @ocash/sdk-node-demo dev -- transfer --token SepoliaETH --amount 0.0001 --to 0x...

# withdraw（--recipient 是 EVM address）
pnpm --filter @ocash/sdk-node-demo dev -- withdraw --token SepoliaETH --amount 0.0001 --recipient 0x...
```

## history 过滤/分页

```bash
# 指定链 + 类型 + 状态
pnpm --filter @ocash/sdk-node-demo dev -- history --chainId 11155111 --type transfer --status confirmed

# 分页
pnpm --filter @ocash/sdk-node-demo dev -- history --limit 20 --offset 20

# 旧到新
pnpm --filter @ocash/sdk-node-demo dev -- history --sort asc
```

## sync 参数

- `--pageSize <number>`：同步 memos/nullifiers 分页大小（也会作为 SDK 默认值传入 `createSdk({ sync })`）
- `--requestTimeoutMs <number>`：同步每次请求的超时时间（毫秒）
- `--watch`：持续同步（调用 `sdk.sync.start()`；按 `pollMs` 轮询）
- `--pollMs <number>`：`--watch` 模式下的轮询间隔（毫秒）
- `--ms <number>`：`--watch` 模式下运行 N 毫秒后自动停止（可选）

示例：

```bash
pnpm --filter @ocash/sdk-node-demo dev -- sync --watch --pollMs 5000
```
