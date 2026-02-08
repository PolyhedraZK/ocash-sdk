# Contributing to @ocash/sdk

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/PolyhedraZK/ocash-sdk.git
cd ocash-sdk

# Install dependencies (requires pnpm 9+)
pnpm install

# Build the SDK
pnpm run build

# Run tests
pnpm run test
```

## Project Structure

```
src/
  core/         # SDK initialization, WASM bridge, resource loading
  crypto/       # BabyJubjub, Poseidon2, key management, memo encryption
  wallet/       # Wallet session, UTXO queries, balance
  sync/         # Memo/nullifier sync, Merkle tree sync
  planner/      # Coin selection, fee calculation, change splitting
  ops/          # End-to-end operation orchestration
  merkle/       # Local Merkle tree, proof generation
  store/        # Storage adapters (Memory, File, IndexedDB, KV, Redis, SQLite)
  tx/           # Transaction builder (relayer request payloads)
  utils/        # Shared utilities
  types.ts      # Public type definitions
tests/          # Vitest test suite
demos/          # Browser and Node.js demo applications
```

## Development Workflow

1. Create a branch from `main`
2. Make your changes
3. Run the test suite: `pnpm run test`
4. Run the type checker: `pnpm run type-check`
5. Build to verify: `pnpm run build`
6. Submit a pull request

## Code Style

- TypeScript strict mode is enabled
- Use `SdkError(code, message)` for error handling (not raw `throw`)
- Avoid `as any` casts — use proper type guards
- Keep functions focused and small
- No `console.log/error` in library code (use event emitter)

## Testing

```bash
# Run all tests
pnpm run test

# Run a specific test file
pnpm exec vitest run tests/planner.test.ts
```

All tests use vitest. When adding new features, please include corresponding tests.

## Commit Messages

Use conventional commit style:

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructuring without behavior change
- `docs:` — documentation only
- `test:` — adding or updating tests

## Reporting Issues

Please use [GitHub Issues](https://github.com/PolyhedraZK/ocash-sdk/issues) and include:

- SDK version
- Environment (browser/Node.js/hybrid)
- Steps to reproduce
- Expected vs actual behavior

## Security

If you discover a security vulnerability, please report it responsibly. See [SECURITY.md](./SECURITY.md) for details.
