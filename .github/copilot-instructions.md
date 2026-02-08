# GitHub Copilot Instructions — @ocash/sdk

## Project

@ocash/sdk is a TypeScript ZKP SDK for privacy-preserving token operations (deposit, transfer, withdraw) using UTXO model and zk-SNARK proofs (Groth16, Go WASM).

## Tech Stack

- TypeScript 5.8 strict, ES2020 target
- tsup build (ESM + CJS dual format, 3 entry points)
- vitest 2.1 for testing
- @noble/curves + @noble/hashes + tweetnacl for cryptography
- viem 2.x for chain interaction
- pnpm 9+, Node 20.19.0+

## Architecture

- `createSdk(config)` factory returns `OCashSdk` with 12 modules: core, keys, crypto, assets, storage, wallet, sync, merkle, planner, zkp, tx, ops
- Event-driven via `onEvent` callback (`SdkEvent` union type)
- UTXO model with Poseidon2 commitments and nullifiers
- 3 entry points: `@ocash/sdk` (universal), `@ocash/sdk/browser` (+IndexedDbStore), `@ocash/sdk/node` (+FileStore)

## Code Style

- Strict TypeScript: no `any`, no `@ts-ignore`
- Error handling: `SdkError(code, message, detail?, cause?)`
- Internal BigInt, external `Hex` (`0x${string}`)
- No deep imports — all exports through entry point files
- No comments on obvious code
- No over-engineering — no abstractions for one-time operations
- BigInt comparison: `(a > b ? 1 : a < b ? -1 : 0)`, never `Number(a - b)`

## Key Types

```typescript
type Hex = `0x${string}`;

interface UtxoRecord {
  chainId: number; assetId: string; amount: bigint;
  commitment: Hex; nullifier: Hex; mkIndex: number;
  isFrozen: boolean; isSpent: boolean;
}

interface CommitmentData {
  asset_id: bigint; asset_amount: bigint;
  user_pk: { user_address: [bigint, bigint] };
  blinding_factor: bigint; is_frozen: boolean;
}

interface SyncCursor { memo: number; nullifier: number; merkle: number; }
```

## Common Patterns

```typescript
// Create SDK
const sdk = createSdk({ chains: [...], onEvent: (e) => {} });
await sdk.core.ready();

// Key derivation (seed >= 16 chars)
const keyPair = sdk.keys.deriveKeyPair(seed, nonce);

// Transfer
const prepared = await sdk.ops.prepareTransfer({
  chainId, assetId, amount, to, ownerKeyPair, publicClient,
});
const result = await sdk.ops.submitRelayerRequest({ prepared, publicClient });

// Crypto primitives
CryptoToolkit.commitment(data);        // Poseidon2
CryptoToolkit.nullifier(sk, cm);       // Nullifier
MemoKit.createMemo(recordOpening);     // Encrypt memo
```

## Testing

- Test files: `tests/{module}.test.ts`
- vitest globals enabled (describe/it/expect without import)
- Run: `pnpm run test`

## Cryptography

- commitment = Poseidon2(asset_id, amount, pk.x, pk.y, blinding_factor)
- nullifier = Poseidon2(commitment, secret_key, merkle_index)
- Memo encryption: ECDH on BabyJubjub → NaCl XSalsa20-Poly1305
- Key derivation: HKDF-SHA256(seed, "OCash.KeyGen")
- Proofs: Groth16 via Go WASM (lazy-loaded at runtime)
