# @ocash/sdk

[![npm version](https://img.shields.io/npm/v/@ocash/sdk)](https://www.npmjs.com/package/@ocash/sdk)
[![CI](https://github.com/PolyhedraZK/ocash-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/PolyhedraZK/ocash-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

TypeScript ZKP SDK for privacy-preserving token operations — deposit, transfer, and withdraw via UTXO model and zk-SNARK proofs.

[Documentation](https://docs.o.cash) | [中文文档](https://docs.o.cash/zh/)

## Features

- **Zero-Knowledge Proofs** — Groth16 zk-SNARK via Go WASM for on-chain privacy
- **UTXO Model** — Poseidon2 commitments, Merkle trees, nullifiers
- **Multi-Environment** — Browser, Node.js, Electron/Tauri
- **Modular** — Factory pattern with event-driven modules, compose what you need
- **6 Storage Adapters** — Memory, IndexedDB, File, KV, Redis, SQLite

## Install

```bash
pnpm add @ocash/sdk
```

## Quick Start

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
await sdk.wallet.open({ seed: 'your-secret-seed-phrase' });
await sdk.sync.syncOnce();

const balance = await sdk.wallet.getBalance({ chainId: 11155111 });
```

## Entry Points

| Import | Environment | Extra |
|--------|-------------|-------|
| `@ocash/sdk` | Universal | `MemoryStore` |
| `@ocash/sdk/browser` | Browser | + `IndexedDbStore` |
| `@ocash/sdk/node` | Node.js | + `FileStore` |

## SDK Modules

```
sdk.core      — WASM & circuit initialization
sdk.keys      — BabyJubjub key derivation
sdk.crypto    — Commitments, nullifiers, memo encryption
sdk.assets    — Chain / token / relayer configuration
sdk.storage   — Persistence adapter
sdk.wallet    — Session, UTXOs, balance
sdk.sync      — Memo / nullifier / Merkle sync
sdk.merkle    — Merkle proofs & membership witnesses
sdk.planner   — Coin selection, fee estimation
sdk.zkp       — zk-SNARK proof generation
sdk.tx        — Relayer request builder
sdk.ops       — End-to-end orchestration
```

## Operations

### Transfer

```ts
const keyPair = sdk.keys.deriveKeyPair(seed);
const prepared = await sdk.ops.prepareTransfer({
  chainId, assetId, amount, to: recipientAddress,
  ownerKeyPair: keyPair, publicClient,
});
const result = await sdk.ops.submitRelayerRequest({ prepared, publicClient });
const txHash = await result.waitRelayerTxHash;
```

### Withdraw

```ts
const prepared = await sdk.ops.prepareWithdraw({
  chainId, assetId, amount, recipient: evmAddress,
  ownerKeyPair: keyPair, publicClient,
});
const result = await sdk.ops.submitRelayerRequest({ prepared, publicClient });
```

### Deposit

```ts
const ownerPub = sdk.keys.getPublicKeyBySeed(seed);
const prepared = await sdk.ops.prepareDeposit({
  chainId, assetId, amount,
  ownerPublicKey: ownerPub, account: walletAddress, publicClient,
});
if (prepared.approveNeeded) {
  await walletClient.writeContract(prepared.approveRequest);
}
await walletClient.writeContract(prepared.depositRequest);
```

## Lifecycle

```
createSdk(config)            →  Initialize
sdk.core.ready()             →  Load WASM & circuits
sdk.wallet.open({ seed })    →  Derive keys, open storage
sdk.sync.start()             →  Background sync (or syncOnce)
sdk.ops.prepareTransfer()    →  Plan, prove, build request
sdk.wallet.close()           →  Release keys, flush storage
```

## Requirements

- **Node.js** >= 20.19.0
- **Browser**: WebAssembly + crypto.getRandomValues + fetch

## Development

```bash
pnpm install
pnpm run build
pnpm run test          # 110 tests
pnpm run dev           # Browser demo
pnpm run demo:node     # Node.js demo
pnpm run docs:dev      # Documentation dev server
```

## License

[MIT](./LICENSE)
