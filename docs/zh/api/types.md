# 类型

## 核心类型

```ts
type Hex = `0x${string}`;
type SdkErrorCode = 'CONFIG' | 'ASSETS' | 'STORAGE' | 'SYNC' | 'CRYPTO' | 'MERKLE' | 'WITNESS' | 'PROOF' | 'RELAYER';
type TransactionReceipt = Awaited<ReturnType<PublicClient['waitForTransactionReceipt']>>;
```

## 配置类型

```ts
interface ChainConfigInput {
  chainId: number;
  rpcUrl?: string;
  entryUrl?: string;
  ocashContractAddress?: Address;
  relayerUrl?: string;
  merkleProofUrl?: string;
  tokens?: TokenMetadata[];
}

interface TokenMetadata {
  id: string;
  symbol: string;
  decimals: number;
  wrappedErc20: Address;
  viewerPk: [string, string];
  freezerPk: [string, string];
  depositFeeBps?: number;
  withdrawFeeBps?: number;
}
```

## UTXO 类型

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

interface CommitmentData {
  asset_id: bigint;
  asset_amount: bigint;
  user_pk: { user_address: [bigint, bigint] };
  blinding_factor: bigint;
  is_frozen: boolean;
}
```

## 同步类型

```ts
interface SyncCursor {
  memo: number;
  nullifier: number;
  merkle: number;
}

interface SyncChainStatus {
  memo: { status: 'idle' | 'syncing' | 'synced' | 'error'; downloaded: number };
  nullifier: { status: 'idle' | 'syncing' | 'synced' | 'error'; downloaded: number };
  merkle: { status: 'idle' | 'syncing' | 'synced' | 'error'; cursor: number };
}
```

## 操作类型

```ts
type OperationType = 'deposit' | 'transfer' | 'withdraw';
type OperationStatus = 'pending' | 'submitted' | 'confirmed' | 'failed';

interface StoredOperation<TDetail = unknown> {
  id: string;
  type: OperationType;
  status: OperationStatus;
  chainId: number;
  assetId: string;
  amount: bigint;
  detail?: TDetail;
  createdAt: number;
  txHash?: Hex;
  error?: string;
}
```

## 证明类型

```ts
interface ProofResult {
  proof: string;
  publicInputs: string[];
}

interface RelayerRequest {
  kind: 'relayer';
  method: 'POST';
  path: string;
  body: Record<string, unknown>;
}
```
