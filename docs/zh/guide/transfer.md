# 转账

转账在 BabyJubjub 地址之间私密地移动代币。发送方、接收方和金额都通过 zk-SNARK 证明隐藏。

## 基本用法

```ts
// 派生所有者密钥对
const ownerKeyPair = sdk.keys.deriveKeyPair(seed, nonce);

// 准备转账
const prepared = await sdk.ops.prepareTransfer({
  chainId: 11155111,
  assetId: 'my-token-id',
  amount: 500000n,
  to: recipientViewingAddress,
  ownerKeyPair,
  publicClient,
});

// 提交到 relayer
const result = await sdk.ops.submitRelayerRequest({
  prepared,
  publicClient,
});

// 等待链上确认
const txHash = await result.waitRelayerTxHash;
const receipt = await result.transactionReceipt;
```

## 费用估算

```ts
const estimate = await sdk.planner.estimate({
  chainId: 11155111,
  assetId: 'my-token-id',
  action: 'transfer',
  amount: 500000n,
});

console.log('Relayer 费用:', estimate.feeSummary.relayerFeeTotal);
console.log('合并次数:', estimate.feeSummary.mergeCount);
```

## 最大可转金额

```ts
const max = await sdk.planner.estimateMax({
  chainId: 11155111,
  assetId: 'my-token-id',
  action: 'transfer',
});

console.log('最大输出:', max.maxSummary.outputAmount);
```

## 自动合并

如果需要花费超过 3 个 UTXO，SDK 会自动规划合并操作。`autoMerge: true` 为默认行为。
