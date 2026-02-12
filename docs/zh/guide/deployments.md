# 部署信息

OCash 已部署在以下网络。SDK 导出了每个部署的预配置链配置。

## 主网

### ETH 主网 (Chain ID: 1)

| 项目 | 值 |
|------|-------|
| 合约 (Proxy) | `0x428c850be686E933DD641eE43574BA35f550c94c` |
| ProxyAdmin | `0xb5161775ded280Eb0E8e07Ed2EaDF7F1D324f142` |
| Entry 服务 | `https://api.o.cash` |
| Relayer | `https://relayer.eth.o.cash` |
| Merkle Proof | `https://freezer.eth.o.cash` |

**资金池：**

| 池 | 代币 | 精度 | 单笔转账上限 | 单笔提现上限 |
|------|-------|----------|--------------|--------------|
| 0 | 原生 (ETH) | 18 | 0.4 ETH | 0.4 ETH |
| 1 | USDT (`0xdAC17F958D2ee523a2206206994597C13D831ec7`) | 6 | 1,100 USDT | 1,100 USDT |
| 2 | USDC (`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`) | 6 | 1,100 USDC | 1,100 USDC |

### BSC 主网 (Chain ID: 56)

| 项目 | 值 |
|------|-------|
| 合约 (Proxy) | `0x428c850be686E933DD641eE43574BA35f550c94c` |
| ProxyAdmin | `0xb5161775ded280Eb0E8e07Ed2EaDF7F1D324f142` |
| Entry 服务 | `https://api.o.cash` |
| Relayer | `https://relayer.bsc.o.cash` |
| Merkle Proof | `https://freezer.bsc.o.cash` |

**资金池：**

| 池 | 代币 | 精度 | 单笔转账上限 | 单笔提现上限 |
|------|-------|----------|--------------|--------------|
| 0 | 原生 (BNB) | 18 | 1.2 BNB | 1.2 BNB |
| 1 | USDT (`0x55d398326f99059fF775485246999027B3197955`) | 18 | 1,100 USDT | 1,100 USDT |
| 2 | USDC (`0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`) | 18 | 1,100 USDC | 1,100 USDC |

### Base 主网 (Chain ID: 8453)

| 项目 | 值 |
|------|-------|
| 合约 (Proxy) | `0x428c850be686E933DD641eE43574BA35f550c94c` |
| Entry 服务 | `https://api.2.o.cash` |
| Relayer | `https://relayer.base.2.o.cash` |
| Merkle Proof | `https://freezer.base.2.o.cash` |

资金池代币通过 `fetchPoolTokensFromContract()` 从合约动态加载。

## 测试网

### Sepolia (Chain ID: 11155111)

| 项目 | 值 |
|------|-------|
| 合约 | `0xAeec58628cC3DC9E9C491e829051D5772679fb7f` |
| Entry 服务 | `https://testnet-api.o.cash` |
| Relayer | `https://testnet-relayer-sepolia.o.cash` |
| Merkle Proof | `https://testnet-freezer-sepolia.o.cash` |

### BSC 测试网 (Chain ID: 97)

| 项目 | 值 |
|------|-------|
| 合约 | `0xAeec58628cC3DC9E9C491e829051D5772679fb7f` |
| Entry 服务 | `https://testnet-api.o.cash` |
| Relayer | `https://testnet-relayer-bsctestnet.o.cash` |
| Merkle Proof | `https://testnet-freezer-bsctestnet.o.cash` |

## 关键地址

| 角色 | 地址 |
|------|---------|
| Owner (Safe 多签) | `0xF31620437c3b2AEC737d12B325D56c546D0C6646` |
| Relayer | `0x68905bfC4aa68cDD80f2b7cD4d21bF4cA461bbE0` |

## SDK 用法

SDK 导出了预配置的链配置：

```ts
import {
  ETH_MAINNET,
  BSC_MAINNET,
  BASE_MAINNET,
  SEPOLIA_TESTNET,
  BSC_TESTNET,
  MAINNET_CHAINS,
  TESTNET_CHAINS,
} from '@ocash/sdk';

// 使用所有主网链
const sdk = createSdk({
  chains: MAINNET_CHAINS,
  onEvent: console.log,
});

// 或选择特定链
const sdk = createSdk({
  chains: [ETH_MAINNET, BSC_MAINNET],
  onEvent: console.log,
});

// 测试网
const sdk = createSdk({
  chains: TESTNET_CHAINS,
  onEvent: console.log,
});
```

对于 Base 主网，资金池代币需要在初始化后从合约加载：

```ts
import { fetchPoolTokensFromContract, BASE_MAINNET } from '@ocash/sdk';

const tokens = await fetchPoolTokensFromContract({
  publicClient,
  chainId: 8453,
  contractAddress: BASE_MAINNET.ocashContractAddress!,
  includeErc20Metadata: true,
});
sdk.assets.appendTokens(8453, tokens);
```
