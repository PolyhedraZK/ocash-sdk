# Architecture

## Overview

`@ocash/sdk` is a modular, headless SDK built around a factory pattern. The `createSdk()` call returns a collection of modules that share a common event bus and storage layer.

```
createSdk(config)
  │
  ├── core       → WASM bridge, circuit loading
  ├── keys       → Key derivation (BabyJubjub)
  ├── crypto     → Commitments, nullifiers, memos
  ├── assets     → Chain/token/relayer configuration
  ├── storage    → Persistence adapter interface
  ├── wallet     → Session management, UTXO/balance
  ├── sync       → Entry Service sync, Merkle sync
  ├── merkle     → Merkle proofs, membership witnesses
  ├── planner    → Coin selection, fee estimation
  ├── zkp        → Witness preparation, proof generation (WASM)
  ├── tx         → Transaction builder (relayer payloads)
  └── ops        → End-to-end orchestration
```

## Module Dependencies

```
ops → planner → wallet → storage
 │       │                   │
 │       └── assets ─────────┤
 │                           │
 ├── zkp → core (WASM)      │
 │                           │
 ├── merkle ─────────────────┤
 │                           │
 ├── tx                      │
 │                           │
 └── sync ───────────────────┘
```

Key principles:
- **Ops** is the highest-level module — it orchestrates everything
- **Planner** handles coin selection and fee logic without network calls
- **ZKP** is isolated — it only depends on the WASM bridge
- **Storage** is a passive interface — any adapter can be injected

## UTXO Model

OCash uses an unspent transaction output (UTXO) model:

1. **Deposit** creates a new UTXO (commitment on-chain)
2. **Transfer** consumes input UTXOs and creates output UTXOs
3. **Withdraw** consumes a UTXO and releases ERC-20 tokens

Each UTXO is a **Pedersen-like commitment** over:
- `asset_id` — which token
- `asset_amount` — how much
- `user_pk` — owner's BabyJubjub public key
- `blinding_factor` — randomness for hiding

## Cryptography Stack

| Layer | Primitive | Purpose |
|-------|-----------|---------|
| Curve | BabyJubjub (twisted Edwards) | Key pairs, addresses |
| Hash | Poseidon2 | Commitments, nullifiers, Merkle nodes |
| Encryption | ECDH + NaCl (XSalsa20-Poly1305) | Memo encryption for recipients |
| Key Derivation | HKDF-SHA256 | Seed → spending key |
| Proofs | Groth16 zk-SNARK (Go WASM) | Transfer & withdraw privacy |

## Event-Driven Design

All modules emit events through a shared `onEvent` callback. Events follow the `SdkEvent` union type:

```ts
type SdkEvent =
  | { type: 'core:ready'; payload: { ... } }
  | { type: 'sync:progress'; payload: { ... } }
  | { type: 'wallet:utxo:update'; payload: { ... } }
  | { type: 'error'; payload: { code: SdkErrorCode; ... } }
  // ...
```

This enables UI updates, logging, and error handling without coupling.

## Proof Generation Flow

```
planner.plan()          → Select UTXOs, compute fees, build plan
    ↓
merkle.getProofByCids() → Fetch Merkle membership proofs
    ↓
merkle.buildInputSecrets() → Build witness inputs from UTXOs + proofs
    ↓
zkp.proveTransfer()     → Generate zk-SNARK proof (Go WASM worker)
    ↓
tx.buildTransferCalldata() → Encode proof into relayer request
    ↓
ops.submitRelayerRequest() → POST to relayer, poll for tx hash
```

The `ops.prepareTransfer()` method wraps all of these steps into a single call.

## Storage Adapter Pattern

The SDK defines a `StorageAdapter` interface with required and optional methods:

**Required**: UTXO storage (`upsertUtxos`, `listUtxos`, `markSpent`), sync cursors (`getSyncCursor`, `setSyncCursor`)

**Optional**: Merkle tree state, merkle nodes, entry memos/nullifiers, operation history

Built-in adapters: `MemoryStore`, `FileStore` (Node), `IndexedDbStore` (Browser), `KeyValueStore`, `RedisStore`, `SqliteStore`
