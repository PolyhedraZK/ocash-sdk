# 提现

提现将代币从隐私池中取出，返回到普通 EVM 地址。

## 基本用法

```ts
// 派生所有者密钥对
const ownerKeyPair = sdk.keys.deriveKeyPair(seed, nonce);

// 准备提现
const prepared = await sdk.ops.prepareWithdraw({
  chainId: 11155111,
  assetId: 'my-token-id',
  amount: 500000n,
  recipient: '0x1234...abcd',  // 接收代币的 EVM 地址
  ownerKeyPair,
  publicClient,
});

// 提交到 relayer
const result = await sdk.ops.submitRelayerRequest({
  prepared,
  publicClient,
});

const txHash = await result.waitRelayerTxHash;
const receipt = await result.transactionReceipt;
```

## Gas Drop

提现时可同时请求原生 ETH（用于接收链上的 gas）：

```ts
const prepared = await sdk.ops.prepareWithdraw({
  // ...
  gasDropValue: 10000000000000000n,  // 0.01 ETH
});
```

## 提现后

交易确认后：
1. UTXO 被标记为已花费（链上发布 nullifier）
2. ERC-20 代币转移到接收地址
3. 运行 `sdk.sync.syncOnce()` 更新本地 UTXO 状态
4. 钱包余额减少提现金额 + 费用
