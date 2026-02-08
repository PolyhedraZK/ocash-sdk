# Types

## Core Types

### `Hex`

```ts
type Hex = `0x${string}`
```

Template literal type for hex-encoded strings.

### `SdkErrorCode`

```ts
type SdkErrorCode = 'CONFIG' | 'ASSETS' | 'STORAGE' | 'SYNC' | 'CRYPTO' | 'MERKLE' | 'WITNESS' | 'PROOF' | 'RELAYER'
```

### `TransactionReceipt`

```ts
type TransactionReceipt = Awaited<ReturnType<PublicClient['waitForTransactionReceipt']>>
```

viem transaction receipt type.

---

## Configuration Types

### `ChainConfigInput`

```ts
interface ChainConfigInput {
  chainId: number;
  rpcUrl?: string;
  entryUrl?: string;
  ocashContractAddress?: Address;
  relayerUrl?: string;
  merkleProofUrl?: string;
  tokens?: TokenMetadata[];
  contract?: Address;  // Legacy alias
}
```

### `TokenMetadata`

```ts
interface TokenMetadata {
  id: string;
  symbol: string;
  decimals: number;
  wrappedErc20: Address;
  viewerPk: [string, string];
  freezerPk: [string, string];
  depositFeeBps?: number;
  withdrawFeeBps?: number;
  transferMaxAmount?: bigint | string;
  withdrawMaxAmount?: bigint | string;
}
```

---

## UTXO Types

### `UtxoRecord`

```ts
interface UtxoRecord {
  chainId: number;
  assetId: string;
  amount: bigint;
  commitment: Hex;
  nullifier: Hex;
  mkIndex: number;
  isFrozen: boolean;
  isSpent: boolean;
  memo?: Hex;
  createdAt?: number;
}
```

### `CommitmentData`

```ts
interface CommitmentData {
  asset_id: bigint;
  asset_amount: bigint;
  user_pk: { user_address: [bigint, bigint] };
  blinding_factor: bigint;
  is_frozen: boolean;
}
```

---

## Sync Types

### `SyncCursor`

```ts
interface SyncCursor {
  memo: number;
  nullifier: number;
  merkle: number;
}
```

### `SyncChainStatus`

```ts
interface SyncChainStatus {
  memo: { status: 'idle' | 'syncing' | 'synced' | 'error'; downloaded: number; total?: number; errorMessage?: string };
  nullifier: { status: 'idle' | 'syncing' | 'synced' | 'error'; downloaded: number; total?: number; errorMessage?: string };
  merkle: { status: 'idle' | 'syncing' | 'synced' | 'error'; cursor: number; errorMessage?: string };
}
```

---

## Merkle Types

### `MerkleTreeState`

```ts
interface MerkleTreeState {
  root: Hex;
  totalElements: number;
  lastUpdated: number;
}
```

### `MerkleNodeRecord`

```ts
interface MerkleNodeRecord {
  id: string;
  hash: Hex;
}
```

### `MerkleLeafRecord`

```ts
interface MerkleLeafRecord {
  chainId: number;
  cid: number;
  commitment: Hex;
}
```

---

## Operation Types

### `OperationType`

```ts
type OperationType = 'deposit' | 'transfer' | 'withdraw'
```

### `OperationStatus`

```ts
type OperationStatus = 'pending' | 'submitted' | 'confirmed' | 'failed'
```

### `StoredOperation`

```ts
interface StoredOperation<TDetail = unknown> {
  id: string;
  type: OperationType;
  status: OperationStatus;
  chainId: number;
  assetId: string;
  amount: bigint;
  detail?: TDetail;
  createdAt: number;
  updatedAt?: number;
  txHash?: Hex;
  error?: string;
}
```

### `ListOperationsQuery`

```ts
interface ListOperationsQuery {
  chainId?: number;
  tokenId?: string;
  type?: OperationType;
  status?: OperationStatus;
  limit?: number;
  offset?: number;
  sort?: 'asc' | 'desc';
}
```

---

## Proof Types

### `ProofResult`

```ts
interface ProofResult {
  proof: string;
  publicInputs: string[];
}
```

### `WitnessBuildResult`

```ts
interface WitnessBuildResult {
  witness: string;  // JSON-serialized witness
  context?: WitnessContext;
}
```

### `RelayerRequest`

```ts
interface RelayerRequest {
  kind: 'relayer';
  method: 'POST';
  path: string;
  body: Record<string, unknown>;
}
```

---

## Entry Types

### `EntryMemoRecord`

```ts
interface EntryMemoRecord {
  chainId: number;
  cid: number;
  commitment: Hex;
  memo: Hex;
  createdAt: number;
}
```

### `EntryNullifierRecord`

```ts
interface EntryNullifierRecord {
  chainId: number;
  nullifier: Hex;
  createdAt: number;
}
```

---

## Key Types

### `WalletSessionInput`

```ts
interface WalletSessionInput {
  seed: string | Uint8Array;
  accountNonce?: number;
}
```
