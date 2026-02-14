# Wallet

The wallet module manages the active session, UTXO queries, and balance calculation.

## `wallet.open(session)`

Opens a wallet session by deriving keys from a seed.

```ts
await sdk.wallet.open({
  seed: 'my-secret-seed-phrase', // At least 16 characters
  accountNonce: 0, // Optional hierarchical nonce
});
```

### Parameters

| Field          | Type                   | Description                                             |
| -------------- | ---------------------- | ------------------------------------------------------- |
| `seed`         | `string \| Uint8Array` | Secret seed (min 16 chars/bytes)                        |
| `accountNonce` | `number?`              | Optional nonce for multiple accounts from the same seed |

This initializes the storage adapter with a `walletId` derived from the seed.

## `wallet.close()`

Closes the wallet session, releases key material, and flushes storage.

```ts
await sdk.wallet.close();
```

::: warning
JS BigInt values cannot be securely zeroed in memory. The SDK nullifies references, but actual clearing depends on garbage collection.
:::

## `wallet.getUtxos(query?)`

Lists UTXOs for the opened wallet.

```ts
const { total, rows } = await sdk.wallet.getUtxos({
  chainId: 11155111,
  assetId: 'my-token',
  includeSpent: false,
  limit: 50,
  offset: 0,
});
```

### Query Parameters

| Field           | Type       | Default | Description                  |
| --------------- | ---------- | ------- | ---------------------------- |
| `chainId`       | `number?`  | all     | Filter by chain              |
| `assetId`       | `string?`  | all     | Filter by asset              |
| `includeSpent`  | `boolean?` | `false` | Include spent UTXOs          |
| `includeFrozen` | `boolean?` | `false` | Include frozen UTXOs         |
| `spent`         | `boolean?` | —       | Override includeSpent        |
| `frozen`        | `boolean?` | —       | Override includeFrozen       |
| `limit`         | `number?`  | —       | Page size                    |
| `offset`        | `number?`  | `0`     | Page offset                  |
| `orderBy`       | `string?`  | —       | `'mkIndex'` or `'createdAt'` |
| `order`         | `string?`  | —       | `'asc'` or `'desc'`          |

### Returns

```ts
{ total: number; rows: UtxoRecord[] }
```

## `wallet.getBalance(query)`

Returns the total balance of spendable (unspent, unfrozen) UTXOs.

```ts
const balance = await sdk.wallet.getBalance({ chainId, assetId });
// balance: bigint (in base units)
```

### Parameters

| Field     | Type      | Description     |
| --------- | --------- | --------------- |
| `chainId` | `number?` | Filter by chain |
| `assetId` | `string?` | Filter by asset |

## `wallet.markSpent(input)`

Marks UTXOs as spent by their nullifiers.

```ts
await sdk.wallet.markSpent({
  chainId: 11155111,
  nullifiers: ['0xabc...', '0xdef...'],
});
```

Typically called after a successful transfer or withdrawal.
