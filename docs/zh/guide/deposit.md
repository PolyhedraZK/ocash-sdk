# 充值

充值将 ERC-20 代币（或原生 ETH）存入隐私池，在链上创建新的 UTXO 承诺。

## 概览

```
ERC-20 代币 → OCash 合约 → UTXO 承诺 + 加密 memo
```

与转账和提现不同，充值直接通过链上合约进行（不经过 relayer）。

## 基本用法

```ts
// 派生所有者公钥
const ownerPub = sdk.keys.getPublicKeyBySeed(seed, nonce);

// 准备充值
const prepared = await sdk.ops.prepareDeposit({
  chainId: 11155111,
  assetId: 'my-token-id',
  amount: 1000000n,
  ownerPublicKey: ownerPub,
  account: account.address,
  publicClient,
});

// 处理授权
if (prepared.approveNeeded && prepared.approveRequest) {
  await walletClient.writeContract(prepared.approveRequest);
}

// 执行充值
await walletClient.writeContract(prepared.depositRequest);
```

## 使用 `submitDeposit`

一步完成授权 + 充值：

```ts
const result = await sdk.ops.submitDeposit({
  prepared,
  walletClient,
  publicClient,
  autoApprove: true,
});

console.log('充值交易:', result.txHash);
```

## 充值后

充值交易确认后：
1. UTXO 承诺存储在链上 Merkle 树中
2. 加密 memo 由 Entry Service 存储
3. 运行 `sdk.sync.syncOnce()` 发现新 UTXO
4. 余额更新以反映充值金额
