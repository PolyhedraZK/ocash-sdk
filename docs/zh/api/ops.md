# Ops

操作模块提供端到端编排：在一次调用中完成规划、证明和提交。

## `ops.prepareTransfer(input)`

完整的转账准备流水线。

```ts
const prepared = await sdk.ops.prepareTransfer({
  chainId: 11155111,
  assetId: 'my-token',
  amount: 500000n,
  to: recipientViewingAddress,
  ownerKeyPair,
  publicClient,
});
```

## `ops.prepareWithdraw(input)`

完整的提现准备流水线。

```ts
const prepared = await sdk.ops.prepareWithdraw({
  chainId: 11155111,
  assetId: 'my-token',
  amount: 500000n,
  recipient: '0x1234...abcd',
  ownerKeyPair,
  publicClient,
});
```

## `ops.prepareDeposit(input)`

准备充值交易。

```ts
const prepared = await sdk.ops.prepareDeposit({
  chainId: 11155111,
  assetId: 'my-token',
  amount: 1000000n,
  ownerPublicKey: ownerPub,
  account: accountAddress,
  publicClient,
});
```

## `ops.submitRelayerRequest(input)`

将准备好的转账或提现提交到 relayer。

```ts
const result = await sdk.ops.submitRelayerRequest({
  prepared,
  publicClient,
});

const txHash = await result.waitRelayerTxHash;
const receipt = await result.transactionReceipt;
```

## `ops.submitDeposit(input)`

提交准备好的充值（可选自动授权）。

```ts
const result = await sdk.ops.submitDeposit({
  prepared,
  walletClient,
  publicClient,
  autoApprove: true,
});
```
