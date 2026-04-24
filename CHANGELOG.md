# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4-rc.4] - 2026-04-24

### Fixed

- `FileStore` / `MemoryStore` / `KeyValueStore`: `getMerkleLeaf` now rejects rows whose `cid` doesn't match the requested one. Positional indexing on `rows?.[cid]` previously returned arbitrary rows when the store was non-contiguous (e.g. external file tampering, restore-from-snapshot) (#14).
- `FileStore.load` and `readMerkleFile`: narrow the ENOENT swallow so parse/IO/permission errors surface instead of silently resetting wallet/shared state to empty. A subsequent save would otherwise overwrite the still-parseable on-disk portion (#14).
- `FileStore.getMerkleNextCid`: throw on a malformed jsonl tail (valid JSON but missing or non-numeric `cid`) instead of silently resetting the cached next cid to 0. A silent reset would cause the next append to overwrite from cid=0 (#14 review follow-up).
- `Planner.recordsFee`: assign `outputAmount` in the specified-amount transfer branch (was previously left at the `0n` initializer). The missing assignment caused `estimateRecords` to always push every UTXO into `payRecords` — `feeSummary.feeCount` inflated to the full cascade-merge count (#16). Plan path was unaffected; only fee-summary display consumers drifted.
- Proof witness context: preserve explicit zero values in fallback resolution (#15).

## [0.1.2] - 2026-03-09

### Added

- `browser.js` CJS shim at package root for browserify compatibility (`require('@ocash/sdk/browser')` now resolves correctly without `exports` map support).
- `browser` field in `package.json`: remaps `dist/index.cjs` → `dist/browser.cjs` for browserify, and stubs `better-sqlite3`, `node:sqlite`, `node:fs/promises`, `node:path` to prevent Node-only modules from entering browser bundles.

## [0.1.1] - 2026-03-07

### Fixed

- `prepareWithdraw`: send net recipient amount (`requestedAmount`) as `burn_amount` in relayer request, not the total UTXO deduction (`burnAmount`). Previously the contract received `inp.amount = burnAmount` and computed `amountWithFee = burnAmount + protocolFee + relayerFee`, which mismatched the circuit's public input, causing ZKP verification failure.
- `SqliteStore` export moved from universal entry (`@ocash/sdk`) to Node-only entry (`@ocash/sdk/node`) to prevent Vite 7+ static analysis errors from `import("sqlite")` appearing in browser bundles.

## [0.1.0] - 2024-12-01

### Added

- Initial release of `@ocash/sdk`
- Factory pattern: `createSdk(config)` with event-driven architecture
- Three entry points: universal, browser (`IndexedDbStore`), Node.js (`FileStore`)
- Core module: WASM bridge, circuit loading, resource management
- Wallet module: seed-based key derivation, UTXO queries, balance calculation
- Sync module: memo/nullifier sync via Entry Service, Merkle tree sync
- Planner module: coin selection, fee calculation, merge planning
- Ops module: end-to-end deposit/transfer/withdraw orchestration
- Storage adapters: `MemoryStore`, `FileStore`, `IndexedDbStore`, `KeyValueStore`, `RedisStore`, `SqliteStore`
- Cryptography: BabyJubjub curve, Poseidon2 hash, ECDH + NaCl memo encryption
- zk-SNARK proof generation via Go WASM worker
- Multi-chain support with per-chain configuration
- Runtime asset loading with chunk support and local caching
- Operation history with filtering, pagination, and pruning
- Bilingual documentation (English/Chinese)
