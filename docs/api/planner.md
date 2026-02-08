# Planner

The planner module handles coin selection, fee estimation, and transaction planning.

## `planner.estimate(input)`

Estimates fees and feasibility for a transfer or withdrawal.

```ts
const estimate = await sdk.planner.estimate({
  chainId: 11155111,
  assetId: 'my-token',
  action: 'transfer',
  amount: 500000n,
  payIncludesFee: false,
});
```

### Parameters

| Field | Type | Description |
|-------|------|-------------|
| `chainId` | `number` | Chain ID |
| `assetId` | `string` | Token/pool ID |
| `action` | `'transfer' \| 'withdraw'` | Operation type |
| `amount` | `bigint` | Amount to transfer/withdraw |
| `payIncludesFee` | `boolean?` | Whether amount includes fees |

### Returns

```ts
{
  feeSummary: {
    mergeCount: number;         // Number of merge steps needed
    relayerFeeTotal: bigint;    // Total relayer fee
    protocolFeeTotal: bigint;   // Total protocol fee
  }
}
```

## `planner.estimateMax(input)`

Estimates the maximum amount that can be transferred or withdrawn.

```ts
const max = await sdk.planner.estimateMax({
  chainId: 11155111,
  assetId: 'my-token',
  action: 'transfer',
});
```

### Returns

```ts
{
  maxSummary: {
    outputAmount: bigint;  // Maximum transferable/withdrawable amount
  }
}
```

## `planner.plan(input)`

Creates a complete transaction plan with coin selection.

### Transfer Plan

```ts
const plan = await sdk.planner.plan({
  action: 'transfer',
  chainId: 11155111,
  assetId: 'my-token',
  amount: 500000n,
  to: recipientAddress,
  autoMerge: true,
});
```

### Withdraw Plan

```ts
const plan = await sdk.planner.plan({
  action: 'withdraw',
  chainId: 11155111,
  assetId: 'my-token',
  amount: 500000n,
  recipient: evmAddress,
  gasDropValue: 10000000000000000n,
});
```

### Parameters

| Field | Type | Description |
|-------|------|-------------|
| `action` | `'transfer' \| 'withdraw'` | Operation type |
| `chainId` | `number` | Chain ID |
| `assetId` | `string` | Token/pool ID |
| `amount` | `bigint` | Amount |
| `to` | `Hex?` | Recipient viewing address (transfer) |
| `recipient` | `Address?` | EVM address (withdraw) |
| `gasDropValue` | `bigint?` | ETH gas drop (withdraw) |
| `payIncludesFee` | `boolean?` | Fee included in amount |
| `autoMerge` | `boolean?` | Auto-plan merge steps |

### Return Types

- **Transfer**: `TransferPlan` with selected UTXOs, output records, and fee summary
- **Transfer with merge**: `TransferMergePlan` with merge steps + final transfer
- **Withdraw**: `WithdrawPlan` with selected UTXO, output record, and fee summary

## Coin Selection

The planner uses a largest-first strategy:
1. Sort UTXOs by amount (descending)
2. Select UTXOs until the target amount + fees is covered
3. If more than 3 UTXOs are needed, plan merge operations first

The circuit supports at most 3 inputs per proof.
