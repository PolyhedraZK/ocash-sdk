# Transfer

Transfers move tokens privately between BabyJubjub addresses. The sender, receiver, and amount are all hidden by zk-SNARK proofs.

## Overview

```
Input UTXOs → zk-SNARK proof → Output UTXOs (recipient + change)
```

A transfer:
1. Selects input UTXOs (coin selection)
2. Generates a zk-SNARK proof
3. Submits the proof to a relayer
4. The relayer verifies and posts the transaction on-chain

## Basic Usage

```ts
// Derive owner key pair
const ownerKeyPair = sdk.keys.deriveKeyPair(seed, nonce);

// Prepare transfer
const prepared = await sdk.ops.prepareTransfer({
  chainId: 11155111,
  assetId: 'my-token-id',
  amount: 500000n,
  to: recipientViewingAddress,  // Hex address
  ownerKeyPair,
  publicClient,
});

// Submit to relayer
const result = await sdk.ops.submitRelayerRequest({
  prepared,
  publicClient,
});

// Wait for on-chain confirmation
const txHash = await result.waitRelayerTxHash;
const receipt = await result.transactionReceipt;
```

## Fee Estimation

Before executing, estimate fees:

```ts
const estimate = await sdk.planner.estimate({
  chainId: 11155111,
  assetId: 'my-token-id',
  action: 'transfer',
  amount: 500000n,
});

console.log('Relayer fee:', estimate.feeSummary.relayerFeeTotal);
console.log('Merge count:', estimate.feeSummary.mergeCount);
```

## Max Transferable

Get the maximum amount that can be transferred:

```ts
const max = await sdk.planner.estimateMax({
  chainId: 11155111,
  assetId: 'my-token-id',
  action: 'transfer',
});

console.log('Max output:', max.maxSummary.outputAmount);
```

## Auto-Merge

If you have more than 3 UTXOs to spend, the SDK automatically plans merge operations:

```ts
const prepared = await sdk.ops.prepareTransfer({
  chainId: 11155111,
  assetId: 'my-token-id',
  amount: 500000n,
  to: recipientViewingAddress,
  ownerKeyPair,
  publicClient,
  autoMerge: true,  // Default behavior
});

if (prepared.kind === 'merge') {
  // Merge step needed first
  const mergeResult = await sdk.ops.submitRelayerRequest({
    prepared: prepared.merge,
    publicClient,
  });
  await mergeResult.waitRelayerTxHash;

  // Re-sync to discover merged UTXO
  await sdk.sync.syncOnce();

  // Now do the actual transfer with prepared.nextInput
  const finalPrepared = await sdk.ops.prepareTransfer(prepared.nextInput);
  // ...
}
```

## Fee Summary

The planner provides detailed fee information:

```ts
const { feeSummary } = prepared.plan;

feeSummary.mergeCount;        // Number of merge steps needed
feeSummary.relayerFeeTotal;   // Total relayer fee (all steps)
feeSummary.protocolFeeTotal;  // Total protocol fee
```
