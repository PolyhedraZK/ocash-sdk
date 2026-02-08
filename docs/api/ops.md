# Ops

The operations module provides end-to-end orchestration: plan, prove, and submit in a single call.

## `ops.prepareTransfer(input)`

Full transfer preparation pipeline.

```ts
const prepared = await sdk.ops.prepareTransfer({
  chainId: 11155111,
  assetId: 'my-token',
  amount: 500000n,
  to: recipientViewingAddress,
  ownerKeyPair,
  publicClient,
  autoMerge: true,
});
```

### Parameters

| Field | Type | Description |
|-------|------|-------------|
| `chainId` | `number` | Chain ID |
| `assetId` | `string` | Token/pool ID |
| `amount` | `bigint` | Transfer amount |
| `to` | `Hex` | Recipient viewing address |
| `ownerKeyPair` | `UserKeyPair` | Sender's key pair |
| `publicClient` | `PublicClient` | viem client for on-chain reads |
| `autoMerge` | `boolean?` | Auto-plan merge steps |

### Returns

For direct transfer:
```ts
{
  kind: 'transfer';
  plan: TransferPlan;
  witness: TransferWitnessInput;
  proof: ProofResult;
  request: RelayerRequest;
  meta: { arrayHashIndex; merkleRootIndex; relayer };
}
```

For transfer requiring merge:
```ts
{
  kind: 'merge';
  plan: TransferMergePlan;
  merge: { /* merge step prepared data */ };
  nextInput: { /* input for next prepareTransfer call */ };
}
```

## `ops.prepareWithdraw(input)`

Full withdrawal preparation pipeline.

```ts
const prepared = await sdk.ops.prepareWithdraw({
  chainId: 11155111,
  assetId: 'my-token',
  amount: 500000n,
  recipient: '0x1234...abcd',
  ownerKeyPair,
  publicClient,
  gasDropValue: 10000000000000000n,
});
```

### Parameters

| Field | Type | Description |
|-------|------|-------------|
| `chainId` | `number` | Chain ID |
| `assetId` | `string` | Token/pool ID |
| `amount` | `bigint` | Withdraw amount |
| `recipient` | `Address` | EVM address to receive tokens |
| `ownerKeyPair` | `UserKeyPair` | Owner's key pair |
| `publicClient` | `PublicClient` | viem client |
| `gasDropValue` | `bigint?` | ETH gas drop amount |

## `ops.prepareDeposit(input)`

Prepares a deposit transaction.

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

### Returns

```ts
{
  chainId: number;
  assetId: string;
  amount: bigint;
  protocolFee: bigint;
  payAmount: bigint;
  value: bigint;
  approveNeeded: boolean;
  approveRequest?: ContractWriteRequest;
  depositRequest: ContractWriteRequest;
}
```

## `ops.submitRelayerRequest(input)`

Submits a prepared transfer or withdrawal to the relayer.

```ts
const result = await sdk.ops.submitRelayerRequest({
  prepared,
  publicClient,
  relayerTimeoutMs: 120_000,
  confirmations: 1,
});
```

### Parameters

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `prepared` | `object` | required | Output from `prepareTransfer` or `prepareWithdraw` |
| `publicClient` | `PublicClient?` | — | For receipt polling |
| `signal` | `AbortSignal?` | — | Cancellation |
| `relayerTimeoutMs` | `number?` | `120000` | Relayer polling timeout |
| `relayerIntervalMs` | `number?` | `2000` | Relayer poll interval |
| `confirmations` | `number?` | `1` | Block confirmations |

### Returns

```ts
{
  result: T;                              // Raw relayer response
  operationId?: string;                   // If operation tracking enabled
  waitRelayerTxHash: Promise<Hex>;        // Resolves when relayer submits tx
  transactionReceipt?: Promise<Receipt>;  // Resolves when tx confirms
}
```

## `ops.submitDeposit(input)`

Submits a prepared deposit (with optional auto-approve).

```ts
const result = await sdk.ops.submitDeposit({
  prepared,
  walletClient,
  publicClient,
  autoApprove: true,
});
```

### Returns

```ts
{
  txHash: Hex;
  approveTxHash?: Hex;
  receipt?: TransactionReceipt;
  operationId?: string;
}
```
