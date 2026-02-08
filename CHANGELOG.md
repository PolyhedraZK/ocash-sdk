# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
