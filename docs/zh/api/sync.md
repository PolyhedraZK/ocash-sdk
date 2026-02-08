# Sync

同步模块将链上状态（memo、nullifier、Merkle 树）与本地存储同步。

## `sync.syncOnce(options?)`

执行单次同步。

```ts
await sdk.sync.syncOnce({
  chainIds: [11155111],
  resources: ['memo', 'nullifier', 'merkle'],
  pageSize: 1024,
  continueOnError: true,
});
```

## `sync.start(options?)`

启动后台轮询。

```ts
await sdk.sync.start({
  chainIds: [11155111],
  pollMs: 10_000,
});
```

先执行一次 `syncOnce`，然后按指定间隔轮询。

## `sync.stop()`

停止后台轮询并中止进行中的同步。

```ts
sdk.sync.stop();
```

## `sync.getStatus()`

返回每条链的当前同步状态。

```ts
const status = sdk.sync.getStatus();
// {
//   11155111: {
//     memo: { status: 'synced', downloaded: 1291 },
//     nullifier: { status: 'synced', downloaded: 80 },
//     merkle: { status: 'synced', cursor: 42 },
//   }
// }
```

状态值：`'idle'` | `'syncing'` | `'synced'` | `'error'`
