# createSdk

创建 SDK 实例的主工厂函数。

## 签名

```ts
function createSdk(config: OCashSdkConfig): OCashSdk
```

## 参数

### `OCashSdkConfig`

```ts
interface OCashSdkConfig {
  chains: ChainConfigInput[];
  assetsOverride?: AssetsOverride;
  cacheDir?: string;
  runtime?: 'auto' | 'browser' | 'node' | 'hybrid';
  storage?: StorageAdapter;
  merkle?: { mode?: 'remote' | 'local' | 'hybrid'; treeDepth?: number };
  sync?: { pageSize?: number; pollMs?: number; requestTimeoutMs?: number; retry?: { ... } };
  onEvent?: (event: SdkEvent) => void;
}
```

## 返回值

### `OCashSdk`

| 模块 | 类型 | 说明 |
|------|------|------|
| `core` | `CoreApi` | WASM 桥接、电路加载 |
| `keys` | `KeyManager` | 密钥派生、地址转换 |
| `crypto` | `CryptoToolkit` | 承诺、nullifier、memo |
| `assets` | `AssetsApi` | 链/代币/relayer 配置 |
| `storage` | `StorageAdapter` | 持久化层 |
| `wallet` | `WalletApi` | 会话、UTXO、余额 |
| `sync` | `SyncApi` | Entry/Merkle 同步 |
| `merkle` | `MerkleApi` | Merkle 证明、证人 |
| `planner` | `PlannerApi` | 币选择、费用估算 |
| `zkp` | `ZkpApi` | 证人/证明生成 |
| `tx` | `TxBuilderApi` | 交易构建器 |
| `ops` | `OpsApi` | 端到端编排 |

## 示例

```ts
import { createSdk } from '@ocash/sdk';

const sdk = createSdk({
  chains: [{
    chainId: 11155111,
    entryUrl: 'https://entry.example.com',
    ocashContractAddress: '0x...',
    relayerUrl: 'https://relayer.example.com',
    tokens: [],
  }],
  onEvent: console.log,
});

await sdk.core.ready();
await sdk.wallet.open({ seed: '...' });
const balance = await sdk.wallet.getBalance({ chainId: 11155111 });
```
