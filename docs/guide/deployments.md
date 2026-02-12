# Deployments

OCash is deployed on the following networks. The SDK exports pre-configured chain configs for each deployment.

## Mainnet

### ETH Mainnet (Chain ID: 1)

| Item | Value |
|------|-------|
| Contract (Proxy) | `0x428c850be686E933DD641eE43574BA35f550c94c` |
| ProxyAdmin | `0xb5161775ded280Eb0E8e07Ed2EaDF7F1D324f142` |
| Entry Service | `https://api.o.cash` |
| Relayer | `https://relayer.eth.o.cash` |
| Merkle Proof | `https://freezer.eth.o.cash` |

**Pools:**

| Pool | Token | Decimals | Transfer Max | Withdraw Max |
|------|-------|----------|--------------|--------------|
| 0 | Native (ETH) | 18 | 0.4 ETH | 0.4 ETH |
| 1 | USDT (`0xdAC17F958D2ee523a2206206994597C13D831ec7`) | 6 | 1,100 USDT | 1,100 USDT |
| 2 | USDC (`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`) | 6 | 1,100 USDC | 1,100 USDC |

### BSC Mainnet (Chain ID: 56)

| Item | Value |
|------|-------|
| Contract (Proxy) | `0x428c850be686E933DD641eE43574BA35f550c94c` |
| ProxyAdmin | `0xb5161775ded280Eb0E8e07Ed2EaDF7F1D324f142` |
| Entry Service | `https://api.o.cash` |
| Relayer | `https://relayer.bsc.o.cash` |
| Merkle Proof | `https://freezer.bsc.o.cash` |

**Pools:**

| Pool | Token | Decimals | Transfer Max | Withdraw Max |
|------|-------|----------|--------------|--------------|
| 0 | Native (BNB) | 18 | 1.2 BNB | 1.2 BNB |
| 1 | USDT (`0x55d398326f99059fF775485246999027B3197955`) | 18 | 1,100 USDT | 1,100 USDT |
| 2 | USDC (`0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`) | 18 | 1,100 USDC | 1,100 USDC |

### Base Mainnet (Chain ID: 8453)

| Item | Value |
|------|-------|
| Contract (Proxy) | `0x428c850be686E933DD641eE43574BA35f550c94c` |
| Entry Service | `https://api.2.o.cash` |
| Relayer | `https://relayer.base.2.o.cash` |
| Merkle Proof | `https://freezer.base.2.o.cash` |

Pool tokens are loaded dynamically from the contract via `fetchPoolTokensFromContract()`.

## Testnet

### Sepolia (Chain ID: 11155111)

| Item | Value |
|------|-------|
| Contract | `0xAeec58628cC3DC9E9C491e829051D5772679fb7f` |
| Entry Service | `https://testnet-api.o.cash` |
| Relayer | `https://testnet-relayer-sepolia.o.cash` |
| Merkle Proof | `https://testnet-freezer-sepolia.o.cash` |

### BSC Testnet (Chain ID: 97)

| Item | Value |
|------|-------|
| Contract | `0xAeec58628cC3DC9E9C491e829051D5772679fb7f` |
| Entry Service | `https://testnet-api.o.cash` |
| Relayer | `https://testnet-relayer-bsctestnet.o.cash` |
| Merkle Proof | `https://testnet-freezer-bsctestnet.o.cash` |

## Key Addresses

| Role | Address |
|------|---------|
| Owner (Safe Multisig) | `0xF31620437c3b2AEC737d12B325D56c546D0C6646` |
| Relayer | `0x68905bfC4aa68cDD80f2b7cD4d21bF4cA461bbE0` |

## SDK Usage

The SDK exports pre-configured chain configs:

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

// Use all mainnet chains
const sdk = createSdk({
  chains: MAINNET_CHAINS,
  onEvent: console.log,
});

// Or pick specific chains
const sdk = createSdk({
  chains: [ETH_MAINNET, BSC_MAINNET],
  onEvent: console.log,
});

// Testnet
const sdk = createSdk({
  chains: TESTNET_CHAINS,
  onEvent: console.log,
});
```

For Base mainnet, pool tokens must be loaded from the contract after initialization:

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
