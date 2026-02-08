# 架构

## 概览

`@ocash/sdk` 是一个模块化的无头（headless）SDK，采用工厂模式构建。`createSdk()` 返回一组共享事件总线和存储层的模块集合。

```
createSdk(config)
  │
  ├── core       → WASM 桥接、电路加载
  ├── keys       → 密钥派生（BabyJubjub）
  ├── crypto     → 承诺、nullifier、memo
  ├── assets     → 链/代币/relayer 配置
  ├── storage    → 持久化适配器接口
  ├── wallet     → 会话管理、UTXO/余额
  ├── sync       → Entry Service 同步、Merkle 同步
  ├── merkle     → Merkle 证明、成员证人
  ├── planner    → 币选择、费用估算
  ├── zkp        → 证人准备、证明生成（WASM）
  ├── tx         → 交易构建器（relayer 载荷）
  └── ops        → 端到端编排
```

## 密码学栈

| 层级 | 原语 | 用途 |
|------|------|------|
| 曲线 | BabyJubjub（扭曲 Edwards） | 密钥对、地址 |
| 哈希 | Poseidon2 | 承诺、nullifier、Merkle 节点 |
| 加密 | ECDH + NaCl（XSalsa20-Poly1305） | memo 加密 |
| 密钥派生 | HKDF-SHA256 | 种子 → 花费密钥 |
| 证明 | Groth16 zk-SNARK（Go WASM） | 转账和提现隐私 |

## 事件驱动设计

所有模块通过共享的 `onEvent` 回调发出事件。事件遵循 `SdkEvent` 联合类型：

```ts
type SdkEvent =
  | { type: 'core:ready'; payload: { ... } }
  | { type: 'sync:progress'; payload: { ... } }
  | { type: 'wallet:utxo:update'; payload: { ... } }
  | { type: 'error'; payload: { code: SdkErrorCode; ... } }
```

这使得 UI 更新、日志记录和错误处理与业务逻辑解耦。

## 证明生成流程

```
planner.plan()          → 选择 UTXO，计算费用，构建计划
    ↓
merkle.getProofByCids() → 获取 Merkle 成员证明
    ↓
merkle.buildInputSecrets() → 从 UTXO + 证明构建证人输入
    ↓
zkp.proveTransfer()     → 生成 zk-SNARK 证明（Go WASM worker）
    ↓
tx.buildTransferCalldata() → 将证明编码为 relayer 请求
    ↓
ops.submitRelayerRequest() → POST 到 relayer，轮询交易哈希
```

`ops.prepareTransfer()` 方法将上述所有步骤封装为单次调用。

## 存储适配器模式

SDK 定义了 `StorageAdapter` 接口，包含必需和可选方法：

**必需**: UTXO 存储（`upsertUtxos`、`listUtxos`、`markSpent`）、同步游标（`getSyncCursor`、`setSyncCursor`）

**可选**: Merkle 树状态、Merkle 节点、entry memo/nullifier、操作记录

内置适配器：`MemoryStore`、`FileStore`（Node）、`IndexedDbStore`（浏览器）、`KeyValueStore`、`RedisStore`、`SqliteStore`
