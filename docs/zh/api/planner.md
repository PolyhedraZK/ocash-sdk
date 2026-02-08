# Planner

规划模块处理币选择、费用估算和交易规划。

## `planner.estimate(input)`

估算转账或提现的费用和可行性。

```ts
const estimate = await sdk.planner.estimate({
  chainId: 11155111,
  assetId: 'my-token',
  action: 'transfer',
  amount: 500000n,
});

console.log('Relayer 费用:', estimate.feeSummary.relayerFeeTotal);
console.log('合并次数:', estimate.feeSummary.mergeCount);
```

## `planner.estimateMax(input)`

估算最大可转账/提现金额。

```ts
const max = await sdk.planner.estimateMax({
  chainId: 11155111,
  assetId: 'my-token',
  action: 'transfer',
});

console.log('最大输出:', max.maxSummary.outputAmount);
```

## `planner.plan(input)`

创建完整的交易计划（含币选择）。

```ts
// 转账计划
const plan = await sdk.planner.plan({
  action: 'transfer',
  chainId: 11155111,
  assetId: 'my-token',
  amount: 500000n,
  to: recipientAddress,
});

// 提现计划
const plan = await sdk.planner.plan({
  action: 'withdraw',
  chainId: 11155111,
  assetId: 'my-token',
  amount: 500000n,
  recipient: evmAddress,
});
```

## 币选择策略

规划器使用最大优先策略：
1. 按金额降序排列 UTXO
2. 选择 UTXO 直到覆盖目标金额 + 费用
3. 如果需要超过 3 个 UTXO，先规划合并操作
