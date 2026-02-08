# Core

核心模块处理 WASM 桥接初始化和电路加载。

## `core.ready()`

加载 WASM 运行时、编译电路并初始化证明引擎。

```ts
await sdk.core.ready();
```

必须在任何证明相关操作（`zkp`、`ops`）之前调用。

发出事件：
- `core:progress` — 加载阶段（`fetch`、`compile`、`init`）
- `core:ready` — 初始化完成

## `core.reset()`

重置核心模块状态。用于重新初始化。

```ts
await sdk.core.reset();
await sdk.core.ready();
```
