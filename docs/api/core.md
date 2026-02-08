# Core

The core module handles WASM bridge initialization and circuit loading.

## `core.ready()`

Loads WASM runtime, compiles circuits, and initializes the proof engine.

```ts
await sdk.core.ready();
```

Must be called before any proof-related operations (`zkp`, `ops`).

Emits events:
- `core:progress` — loading stages (`fetch`, `compile`, `init`)
- `core:ready` — initialization complete

## `core.reset()`

Resets the core module state. Useful for re-initialization.

```ts
await sdk.core.reset();
await sdk.core.ready(); // Re-initialize
```
