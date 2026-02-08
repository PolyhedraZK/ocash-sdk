# Deposit

Deposits shield ERC-20 tokens (or native ETH) into the privacy pool, creating a new UTXO commitment on-chain.

## Overview

```
ERC-20 tokens → OCash Contract → UTXO commitment + encrypted memo
```

Unlike transfers and withdrawals, deposits go directly through the on-chain contract (not the relayer). The SDK handles:
1. Computing the deposit fee
2. ERC-20 approval (if needed)
3. Building the deposit transaction
4. Encrypting a memo for the recipient's wallet to discover the UTXO

## Basic Usage

```ts
import { createPublicClient, createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';

// viem clients
const publicClient = createPublicClient({ chain: sepolia, transport: http() });
const walletClient = createWalletClient({ chain: sepolia, transport: http(), account });

// Derive the owner's public key
const ownerPub = sdk.keys.getPublicKeyBySeed(seed, nonce);

// Prepare deposit
const prepared = await sdk.ops.prepareDeposit({
  chainId: 11155111,
  assetId: 'my-token-id',
  amount: 1000000n,         // In base units (e.g. 1 USDC = 1000000)
  ownerPublicKey: ownerPub,
  account: account.address,  // Depositor's EOA
  publicClient,
});
```

## Handling Approval

For ERC-20 tokens, you may need to approve the contract first:

```ts
if (prepared.approveNeeded && prepared.approveRequest) {
  const approveTxHash = await walletClient.writeContract(prepared.approveRequest);
  await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
}

// Execute deposit
const txHash = await walletClient.writeContract(prepared.depositRequest);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
```

## Using `submitDeposit`

For convenience, `ops.submitDeposit` handles approval + deposit in one call:

```ts
const result = await sdk.ops.submitDeposit({
  prepared,
  walletClient,
  publicClient,
  autoApprove: true,  // Automatically approve if needed
});

console.log('Deposit tx:', result.txHash);
console.log('Receipt:', result.receipt);
```

## Fees

`prepared` includes fee information:

| Field | Description |
|-------|-------------|
| `protocolFee` | On-chain protocol fee (from `depositFeeBps`) |
| `depositRelayerFee` | Relayer deposit fee (if applicable) |
| `payAmount` | Total amount the depositor needs to pay |
| `value` | ETH value to send with the transaction (for native deposits) |

## After Deposit

After the deposit transaction confirms:
1. The UTXO commitment is stored on-chain in the Merkle tree
2. The encrypted memo is stored by the Entry Service
3. Run `sdk.sync.syncOnce()` to discover the new UTXO in your wallet
4. The balance updates to reflect the deposited amount

## Native ETH Deposits

For native ETH (wrapped as a privacy token), the deposit value is sent as `msg.value`:

```ts
// prepared.value will be non-zero for native deposits
// The SDK sets this automatically in the depositRequest
```
