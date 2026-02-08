# Wallet

钱包模块管理活跃会话、UTXO 查询和余额计算。

## `wallet.open(session)`

通过种子派生密钥打开钱包会话。

```ts
await sdk.wallet.open({
  seed: 'my-secret-seed-phrase',  // 至少 16 个字符
  accountNonce: 0,
});
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `seed` | `string \| Uint8Array` | 秘密种子（最少 16 字符/字节） |
| `accountNonce` | `number?` | 可选，用于同一种子派生多个账户 |

## `wallet.close()`

关闭钱包会话，释放密钥材料，刷新存储。

```ts
await sdk.wallet.close();
```

## `wallet.getUtxos(query?)`

列出已打开钱包的 UTXO。

```ts
const { total, rows } = await sdk.wallet.getUtxos({
  chainId: 11155111,
  assetId: 'my-token',
  includeSpent: false,
  limit: 50,
});
```

## `wallet.getBalance(query?)`

返回可花费（未花费、未冻结）UTXO 的总余额。

```ts
const balance = await sdk.wallet.getBalance({
  chainId: 11155111,
  assetId: 'my-token',
});
// balance: bigint（基本单位）
```

## `wallet.markSpent(input)`

通过 nullifier 标记 UTXO 为已花费。

```ts
await sdk.wallet.markSpent({
  chainId: 11155111,
  nullifiers: ['0xabc...', '0xdef...'],
});
```
