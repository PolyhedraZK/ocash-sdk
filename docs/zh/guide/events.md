# 事件与错误

## 事件系统

所有 SDK 模块通过 `onEvent` 回调发出事件：

```ts
const sdk = createSdk({
  chains: [...],
  onEvent: (event) => {
    console.log(event.type, event.payload);
  },
});
```

## 事件类型

### Core 事件

```ts
{ type: 'core:ready', payload: { assetsVersion: string; durationMs: number } }
{ type: 'core:progress', payload: { stage: 'fetch' | 'compile' | 'init'; loaded: number; total?: number } }
```

### 同步事件

```ts
{ type: 'sync:start', payload: { chainId: number } }
{ type: 'sync:progress', payload: { chainId: number; resource: 'memo' | 'nullifier' | 'merkle'; downloaded: number } }
{ type: 'sync:done', payload: { chainId: number; cursor: SyncCursor } }
```

### 钱包事件

```ts
{ type: 'wallet:utxo:update', payload: { chainId: number; added: number; spent: number; frozen: number } }
```

### ZKP 事件

```ts
{ type: 'zkp:start', payload: { circuit: 'transfer' | 'withdraw' } }
{ type: 'zkp:done', payload: { circuit: 'transfer' | 'withdraw'; costMs: number } }
```

## 错误处理

错误以 `error` 类型事件发出：

```ts
{
  type: 'error',
  payload: {
    code: SdkErrorCode,   // 'CONFIG' | 'ASSETS' | 'STORAGE' | 'SYNC' | 'CRYPTO' | 'MERKLE' | 'WITNESS' | 'PROOF' | 'RELAYER'
    message: string,
    detail?: unknown,
    cause?: unknown,
  }
}
```

### 错误码

| 错误码 | 说明 |
|--------|------|
| `CONFIG` | SDK 配置无效 |
| `ASSETS` | WASM/电路加载失败 |
| `STORAGE` | 存储适配器错误 |
| `SYNC` | Entry/Merkle 同步失败 |
| `CRYPTO` | 密码学操作失败 |
| `MERKLE` | Merkle 证明失败 |
| `WITNESS` | 证人构建失败 |
| `PROOF` | zk-SNARK 证明生成失败 |
| `RELAYER` | Relayer 通信失败 |
