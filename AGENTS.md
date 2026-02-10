# AGENTS.md — @ocash/sdk

> Context file for AI coding agents (Codex, Devin, etc.)

## What This Is

@ocash/sdk is a TypeScript ZKP SDK for privacy-preserving token operations — deposit, transfer, withdraw — via a UTXO model and zk-SNARK proofs (Groth16, Go WASM). It is headless and multi-environment (browser, Node.js, Electron/Tauri) with a factory pattern.

## Repo Conventions

The repository is a single-package layout. The root `package.json` is the only dependency and scripts entry.

- SDK source: `src/`
- Build output: `dist/` (publish includes only `dist/` and `assets/`)
- Demos: `demos/` (for showcase/debug only; not published with the SDK)
- Browser demo: `pnpm run dev`
- Node demo: `pnpm run demo:node -- <command>`

## Repo Layout

```
src/                          # SDK source (~60 files, ~8400 lines)
  index.ts                    # Main entry: createSdk factory + re-exports
  index.browser.ts            # Browser entry: + IndexedDbStore
  index.node.ts               # Node entry: + FileStore
  types.ts                    # All type definitions (~850 lines)
  errors.ts                   # Error codes and SdkError
  core/                       # SdkCore: event bus, init orchestration
  crypto/                     # Poseidon2, BabyJubjub, key derivation, commitments
  wallet/                     # WalletService: session, UTXO, balance, memo decrypt
  sync/                       # SyncEngine: Entry/Merkle data sync, polling
  planner/                    # Planner: coin selection, change, fee calc, merge
  ops/                        # Ops: end-to-end orchestration (plan → proof → submit)
  proof/                      # ProofEngine: witness/proof generation
  merkle/                     # MerkleEngine: tree build, proof calc, root index
  tx/                         # TxBuilder: relayer request payloads
  store/                      # StorageAdapter impls (Memory/KV/File/IndexedDB)
  memo/                       # MemoKit: ECDH + NaCl secretbox encrypt/decrypt
  runtime/                    # WasmBridge: WASM loading, runtime detect, asset cache
  ledger/                     # Chain/token/relayer configuration
  assets/                     # Default assets metadata
  abi/                        # Contract ABIs
  dummy/                      # Test data helpers
  utils/                      # Shared utilities (random, signal, url, bigint)
tests/                        # Vitest tests (~38 files)
demos/browser/                # React + Vite + wagmi browser demo
demos/node/                   # Node CLI demo
```

## Commands

```bash
pnpm install                  # Install deps (pnpm 9+ required, NOT npm/yarn)
pnpm run build                # Build SDK (clean + tsup → dist/)
pnpm run type-check           # TypeScript strict check (no emit)
pnpm run test                 # Run tests (vitest)
pnpm run dev                  # Browser demo (Vite, port 5173)
pnpm run dev:sdk              # SDK watch mode (tsup --watch)
pnpm run demo:node -- <cmd>   # Run Node demo (requires build)
pnpm run demo:node:tsx -- <cmd> # Run Node demo via tsx
```

## Tech Stack

- TypeScript 5.8 strict, ES2020 target
- tsup (ESM + CJS dual format, 3 entry points)
- vitest 2.1 (Node env, globals, restoreMocks)
- @noble/curves + @noble/hashes + tweetnacl (crypto)
- viem 2.x (chain interaction)
- Go WASM (Groth16 proofs via WasmBridge)
- pnpm 9.15+, Node 20.19.0+

## Architecture

- Factory pattern: `createSdk(config)` → returns `OCashSdk` with all modules
- Event-driven: all state changes via `onEvent` callback (`SdkEvent` union type)
- UTXO model: not account balances — unspent transaction outputs
- 12 modules: core, keys, crypto, assets, storage, wallet, sync, merkle, planner, zkp, tx, ops
- 3 entry points: `@ocash/sdk` (universal), `@ocash/sdk/browser` (+IndexedDbStore), `@ocash/sdk/node` (+FileStore)

## Key Patterns

- Error handling: `SdkError(code, message, detail?, cause?)` — not raw throw
- Internal BigInt, external Hex (`0x${string}`)
- Exports converge through entry points — no deep imports like `@ocash/sdk/src/crypto/...`
- `core.ready()` must be called before any proof/witness operations (loads WASM lazily)
- StorageAdapter is an interface — default MemoryStore is non-persistent

## Testing

- All tests in `tests/` directory, file pattern `{module}.test.ts`
- vitest globals: `describe`/`it`/`expect` without import
- `restoreMocks: true` — mocks auto-restore per test
- Seeds in tests must be >= 16 characters
- Run `pnpm run test` — all tests must pass before any change is complete

## Code Style

- Strict TypeScript — no `any`, no `@ts-ignore`
- No comments on obvious code
- Module directories map 1:1 to functionality
- No `shared/`, `common/`, `helpers/` junk directories
- BigInt sort: `(a > b ? 1 : a < b ? -1 : 0)` — never `Number(a - b)`

## Full API Reference

See `llms.txt` in repo root for complete API signatures, type definitions, and code examples.
