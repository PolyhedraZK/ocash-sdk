# Withdraw

Withdrawals unshield tokens from the privacy pool back to a regular EVM address.

## Overview

```
Input UTXO → zk-SNARK proof → ERC-20 tokens released to recipient
```

A withdrawal:
1. Selects an input UTXO
2. Generates a zk-SNARK proof
3. Submits the proof to a relayer
4. The relayer verifies, posts the transaction, and the contract releases tokens

## Basic Usage

```ts
// Derive owner key pair
const ownerKeyPair = sdk.keys.deriveKeyPair(seed, nonce);

// Prepare withdrawal
const prepared = await sdk.ops.prepareWithdraw({
  chainId: 11155111,
  assetId: 'my-token-id',
  amount: 500000n,
  recipient: '0x1234...abcd',  // EVM address to receive tokens
  ownerKeyPair,
  publicClient,
});

// Submit to relayer
const result = await sdk.ops.submitRelayerRequest({
  prepared,
  publicClient,
});

const txHash = await result.waitRelayerTxHash;
const receipt = await result.transactionReceipt;
```

## Gas Drop

Request native ETH along with the withdrawal (for gas on the receiving chain):

```ts
const prepared = await sdk.ops.prepareWithdraw({
  chainId: 11155111,
  assetId: 'my-token-id',
  amount: 500000n,
  recipient: '0x1234...abcd',
  ownerKeyPair,
  publicClient,
  gasDropValue: 10000000000000000n,  // 0.01 ETH
});
```

## Fee Estimation

```ts
const estimate = await sdk.planner.estimate({
  chainId: 11155111,
  assetId: 'my-token-id',
  action: 'withdraw',
  amount: 500000n,
});

console.log('Relayer fee:', estimate.feeSummary.relayerFeeTotal);
console.log('Protocol fee:', estimate.feeSummary.protocolFeeTotal);
```

## Max Withdrawable

```ts
const max = await sdk.planner.estimateMax({
  chainId: 11155111,
  assetId: 'my-token-id',
  action: 'withdraw',
});

console.log('Max output:', max.maxSummary.outputAmount);
```

## After Withdrawal

After the withdrawal transaction confirms:
1. The UTXO is marked as spent (nullifier published on-chain)
2. ERC-20 tokens are transferred to the recipient address
3. Run `sdk.sync.syncOnce()` to update local UTXO state
4. The wallet balance decreases by the withdrawn amount + fees
