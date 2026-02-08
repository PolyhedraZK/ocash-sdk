# UTXO 模型

## 什么是 UTXO？

UTXO（Unspent Transaction Output，未花费交易输出）代表由特定密钥拥有的离散价值单位。与基于账户的系统（如以太坊原生模型）不同，UTXO 系统追踪可被消费和创建的个别"硬币"。

在 OCash 中，每个 UTXO 在链上以**承诺（commitment）**的形式表示 — 一个隐藏了所有者、金额和资产类型的密码学哈希。

## 承诺结构

每个 UTXO 承诺是以下字段的 Poseidon2 哈希：

```
commitment = Poseidon2(asset_id, asset_amount, user_pk.x, user_pk.y, blinding_factor)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `asset_id` | `bigint` | 代币/池标识符 |
| `asset_amount` | `bigint` | 基本单位的金额 |
| `user_pk` | `[bigint, bigint]` | 所有者的 BabyJubjub 公钥 |
| `blinding_factor` | `bigint` | 用于隐藏的随机值 |

## Nullifier

当 UTXO 被花费时，链上会发布一个 **nullifier**：

```
nullifier = Poseidon2(commitment, secret_key, merkle_index)
```

nullifier 唯一标识一个已花费的 UTXO，但不会泄露它对应的是哪个承诺。合约维护一个已使用 nullifier 的集合来防止双花。

## Merkle 树

所有承诺都插入到一个只追加的 Merkle 树中（深度 32，Poseidon2 哈希）。树根存储在链上。

要证明 UTXO 的所有权，证明者需要展示：
1. 承诺原像的知识（金额、密钥、盲因子）
2. 有效的 Merkle 成员证明（承诺存在于树中）
3. 正确的 nullifier 推导

这一切都在 zk-SNARK 电路内完成 — 验证者对输入一无所知。

## 交易流程

### 充值（Shield）

```
ERC-20 代币 → OCash 合约 → 新的 UTXO 承诺 + 加密 memo
```

### 转账（Private）

```
输入 UTXO（消费） → zk-SNARK 证明 → 输出 UTXO（创建）
```

一笔转账消费 1-3 个输入 UTXO 并创建 1-2 个输出 UTXO：
- 一个给接收方
- 一个作为找零（返回给发送方）

### 提现（Unshield）

```
输入 UTXO（消费） → zk-SNARK 证明 → ERC-20 代币释放
```

## 合并操作

电路每次转账最多支持 3 个输入 UTXO。如果用户有很多小额 UTXO（粉尘），需要先进行**合并**：

```
[UTXO₁, UTXO₂, UTXO₃] → 合并 → [UTXO_合并]
[UTXO_合并, UTXO₄, UTXO₅] → 合并 → [UTXO_合并₂]
[UTXO_合并₂] → 转账 → [UTXO_接收方, UTXO_找零]
```

planner 模块会自动处理此过程 — 费用摘要中的 `mergeCount` 表示需要多少次合并步骤。
