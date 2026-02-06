import { createDemoSdk } from '../sdk/createDemoSdk.js';
import { loadDemoConfig } from '../config/demoConfig.js';
import { KeyManager } from '@ocash/sdk';
import { FileStore } from '@ocash/sdk/node';
import { getChain, getToken } from '../domain/ocash.js';
import { formatAmount, parseAmount } from '../domain/format.js';
import { getClients } from '../io/clients.js';
import { App_ABI } from '@ocash/sdk';
import { getAddress, isAddress } from 'viem';
import type { ChainConfigInput, SdkEvent } from '@ocash/sdk';
import path from 'node:path';

type Hex = `0x${string}`;

type RpcRequest = { id: string; method: string; params?: any };
type RpcResponse = { id: string; ok: true; result: any } | { id: string; ok: false; error: { message: string; stack?: string; name?: string; code?: string; detail?: any; cause?: any } };

const toJsonSafe = (value: any): any => {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((entry) => toJsonSafe(entry));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toJsonSafe(v);
    }
    return out;
  }
  return value;
};

const reply = (msg: RpcResponse) => {
  if (typeof (process as any).send === 'function') {
    (process as any).send(toJsonSafe(msg));
  }
};

const fail = (id: string, err: unknown) => {
  const anyErr = err as any;
  const error =
    err instanceof Error
      ? {
          name: err.name,
          message: err.message,
          stack: err.stack,
          code: typeof anyErr?.code === 'string' ? anyErr.code : undefined,
          detail: anyErr?.detail,
          cause: anyErr?.cause instanceof Error ? { name: anyErr.cause.name, message: anyErr.cause.message, stack: anyErr.cause.stack } : anyErr?.cause,
        }
      : { message: String(err) };
  reply({ id, ok: false, error });
};

const isViewingAddress = (value: string): value is Hex => /^0x[0-9a-fA-F]{64}$/.test(value);

async function main() {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    const [k, v] = raw.split('=', 2);
    if (!k || v == null) continue;
    args.set(k, v);
  }

  const configPath = args.get('configPath') || undefined;
  const chainId = args.get('chainId') ? Number(args.get('chainId')) : undefined;
  const pollMs = args.get('pollMs') ? Number(args.get('pollMs')) : 5000;
  const rebuildMerkle = args.get('rebuildMerkle') === '1' || args.get('rebuildMerkle') === 'true';
  const streamLogs = args.get('streamLogs') === '1' || args.get('streamLogs') === 'true';
  const streamSync = args.get('streamSync') === '1' || args.get('streamSync') === 'true';

  const config = await loadDemoConfig({ configPath });
  const baseDir = args.get('baseDir') ?? path.join(config.storageDir ?? '.ocash-demo', 'demoAll');
  const chain: ChainConfigInput = getChain(config.chains, chainId);

  const pub = KeyManager.getPublicKeyBySeed(config.seed, config.accountNonce != null ? String(config.accountNonce) : undefined);
  const walletId = KeyManager.userPkToAddress(pub.user_pk);
  const store = new FileStore({ baseDir });
  await store.init({ walletId });

  const logBuffer: Array<{ ts: number; level: 'debug' | 'info' | 'warn' | 'error'; scope: string; message: string; detail?: any }> = [];
  let activeRpcDepth = 0;
  let streamSyncLogs = streamSync;
  const pushLog = (entry: Omit<(typeof logBuffer)[number], 'ts'>) => {
    const log = { ts: Date.now(), ...entry };
    logBuffer.push(log);
    if (logBuffer.length > 500) logBuffer.splice(0, logBuffer.length - 500);
    if (streamLogs && typeof (process as any).send === 'function') {
      // avoid flooding the interactive terminal with high-volume sync/debug logs
      const allowSync = streamSyncLogs || activeRpcDepth > 0;
      if ((log.level !== 'debug' || activeRpcDepth > 0) && (log.scope !== 'sync' || allowSync)) {
        (process as any).send({ type: 'log', log: toJsonSafe(log) });
      }
    }
  };

  const lastSyncProgress = new Map<string, { ts: number; chainId: number; resource: string; downloaded: number; total?: number }>();

  const canPersistMerkle = typeof (store as any).getMerkleLeaves === 'function' && typeof (store as any).appendMerkleLeaves === 'function';

  const maybeResetCursorForMerkle = async (reason: string) => {
    await (store as any).clearMerkleLeaves?.(chain.chainId);
    const prev = await store.getSyncCursor(chain.chainId).catch(() => undefined);
    await store.setSyncCursor(chain.chainId, { memo: 0, merkle: 0, nullifier: prev?.nullifier ?? 0 });
    pushLog({ level: 'warn', scope: 'merkle', message: `reset cursor to rebuild local merkle (${reason})` });
  };

  if (rebuildMerkle) {
    await maybeResetCursorForMerkle('forced');
  } else if (canPersistMerkle) {
    const cursor = await store.getSyncCursor(chain.chainId).catch(() => undefined);
    const memoCursor = cursor?.memo ?? 0;
    const persisted = (await (store as any).getMerkleLeaves?.(chain.chainId)) as any[] | undefined;
    const hasLeaves = Array.isArray(persisted) && persisted.length > 0;
    if (memoCursor > 0 && !hasLeaves) {
      await maybeResetCursorForMerkle('no persisted leaves');
    }
  }

  const onEvent = (evt: SdkEvent) => {
    if (evt.type === 'error') {
      pushLog({ level: 'error', scope: 'sdk', message: `${evt.payload.code}: ${evt.payload.message}`, detail: evt.payload.detail });
      return;
    }
    if (evt.type === 'debug') {
      pushLog({ level: 'debug', scope: evt.payload.scope, message: evt.payload.message, detail: evt.payload.detail });
      return;
    }
    if (evt.type === 'zkp:start') {
      pushLog({ level: 'info', scope: 'zkp', message: `start ${evt.payload.circuit}` });
      return;
    }
    if (evt.type === 'zkp:done') {
      pushLog({ level: 'info', scope: 'zkp', message: `done ${evt.payload.circuit}`, detail: { costMs: evt.payload.costMs } });
      return;
    }
    if (evt.type === 'sync:progress') {
      lastSyncProgress.set(`${evt.payload.chainId}:${evt.payload.resource}`, {
        ts: Date.now(),
        chainId: evt.payload.chainId,
        resource: evt.payload.resource,
        downloaded: evt.payload.downloaded,
        total: evt.payload.total ?? undefined,
      });
      pushLog({
        level: 'info',
        scope: 'sync',
        message: `${evt.payload.chainId}:${evt.payload.resource} ${evt.payload.downloaded}/${evt.payload.total ?? '?'}`,
      });
      return;
    }
  };

  const sdk = createDemoSdk({
    config,
    storage: store,
    onEvent,
    sync: { pollMs: Number.isFinite(pollMs) ? pollMs : 5000 },
    // hybrid: build local merkle when possible, but fall back to remote proof server when local tree can't be reconstructed (e.g. non-zero persisted cursor)
    merkle: { mode: 'hybrid' },
  });

  await sdk.core.ready();
  await sdk.wallet.open({ seed: config.seed, accountNonce: config.accountNonce });
  await sdk.sync.start({ chainIds: [chain.chainId], pollMs: Number.isFinite(pollMs) ? pollMs : 5000 });

  let unwatchContractEvent: null | (() => void) = null;
  if (chain.ocashContractAddress && chain.rpcUrl) {
    const { publicClient } = getClients(chain);
    unwatchContractEvent = publicClient.watchContractEvent({
      address: chain.ocashContractAddress,
      abi: App_ABI as any,
      eventName: 'ArrayMergedToTree',
      onLogs: (logs: any[]) => {
        for (const log of logs) {
          pushLog({
            level: 'info',
            scope: 'contract:ArrayMergedToTree',
            message: `tx=${log.transactionHash}`,
            detail: {
              batchIndex: (log.args as any)?.batchIndex?.toString?.(),
              newRoot: (log.args as any)?.newRoot?.toString?.(),
            },
          });
        }
      },
    });
  }

  const owner = sdk.keys.deriveKeyPair(config.seed, config.accountNonce != null ? String(config.accountNonce) : undefined);
  const selfViewingAddress = sdk.keys.userPkToAddress(owner.user_pk) as Hex;

  if (typeof (process as any).send === 'function') {
    (process as any).send({ type: 'ready', chainId: chain.chainId, viewingAddress: selfViewingAddress });
  }

  const shutdown = async () => {
    try {
      sdk.sync.stop();
    } catch {}
    try {
      unwatchContractEvent?.();
    } catch {}
    try {
      await store.close?.();
    } catch {}
  };

  process.on('disconnect', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });

  const pauseSyncAndSyncOnce = async () => {
    sdk.sync.stop();
    await sdk.sync.syncOnce({ chainIds: [chain.chainId] });
  };

  const resumeSync = async () => {
    await sdk.sync.start({ chainIds: [chain.chainId], pollMs: Number.isFinite(pollMs) ? pollMs : 5000 });
  };

  const preflightContractReads = async (publicClient: ReturnType<typeof getClients>['publicClient']) => {
    const contractAddress = chain.ocashContractAddress;
    if (!contractAddress) throw new Error(`chain ${chain.chainId} missing ocashContractAddress`);
    const rpcChainId = await publicClient.getChainId();
    if (rpcChainId !== chain.chainId) {
      throw new Error(`rpcUrl chainId mismatch: expected ${chain.chainId}, got ${rpcChainId} (check chains[].rpcUrl)`);
    }
    const code = await publicClient.getBytecode({ address: contractAddress });
    if (!code || code === '0x') {
      throw new Error(`contract not found at ${contractAddress} on chainId ${chain.chainId} (check ocashContractAddress)`);
    }
  };

  const handlers: Record<string, (params: any) => Promise<any>> = {
    address: async () => {
      return { viewingAddress: selfViewingAddress };
    },

    assets: async () => {
      return {
        chain: {
          chainId: chain.chainId,
          rpcUrl: chain.rpcUrl,
          entryUrl: chain.entryUrl,
          relayerUrl: chain.relayerUrl,
          merkleProofUrl: chain.merkleProofUrl,
          ocashContractAddress: chain.ocashContractAddress,
        },
        tokens: sdk.assets.getTokens(chain.chainId).map((t) => ({ id: t.id, symbol: t.symbol, decimals: t.decimals, wrappedErc20: t.wrappedErc20 })),
        relayerConfig: sdk.assets.getRelayerConfig(chain.chainId) ?? null,
      };
    },

    balance: async () => {
      return handlers['balance-unspent']({});
    },

    'balance-unspent': async () => {
      await pauseSyncAndSyncOnce();
      try {
        const utxos = (await sdk.wallet.getUtxos({ chainId: chain.chainId, includeSpent: false, includeFrozen: true })).rows;
        const tokens = new Map(sdk.assets.getTokens(chain.chainId).map((t) => [t.id, t] as const));
        return utxos
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
          .map((u) => {
            const token = tokens.get(u.assetId);
            return {
              symbol: token?.symbol ?? u.assetId,
              amount: formatAmount(u.amount, token?.decimals ?? 18),
              mkIndex: u.mkIndex,
              isFrozen: u.isFrozen,
              commitment: u.commitment,
              nullifier: u.nullifier,
              createdAt: u.createdAt,
            };
          });
      } finally {
        await resumeSync();
      }
    },

    'balance-spent': async () => {
      await pauseSyncAndSyncOnce();
      try {
        const utxos = (await sdk.wallet.getUtxos({ chainId: chain.chainId, includeSpent: true, includeFrozen: true })).rows;
        const tokens = new Map(sdk.assets.getTokens(chain.chainId).map((t) => [t.id, t] as const));
        const totals = new Map<string, bigint>();
        for (const u of utxos) {
          if (!u.isSpent) continue;
          totals.set(u.assetId, (totals.get(u.assetId) ?? 0n) + u.amount);
        }
        return Array.from(totals.entries()).map(([assetId, amount]) => {
          const token = tokens.get(assetId);
          return {
            symbol: token?.symbol ?? assetId,
            amount: formatAmount(amount, token?.decimals ?? 18),
          };
        });
      } finally {
        await resumeSync();
      }
    },

    'balance-details': async () => {
      await pauseSyncAndSyncOnce();
      try {
        const utxos = (await sdk.wallet.getUtxos({ chainId: chain.chainId, includeSpent: true, includeFrozen: true })).rows;
        const tokens = new Map(sdk.assets.getTokens(chain.chainId).map((t) => [t.id, t] as const));
        return utxos
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
          .map((u) => {
            const token = tokens.get(u.assetId);
            return {
              symbol: token?.symbol ?? u.assetId,
              amount: formatAmount(u.amount, token?.decimals ?? 18),
              mkIndex: u.mkIndex,
              isSpent: u.isSpent,
              isFrozen: u.isFrozen,
              commitment: u.commitment,
              nullifier: u.nullifier,
              createdAt: u.createdAt,
            };
          });
      } finally {
        await resumeSync();
      }
    },

    history: async (params: { limit?: number }) => {
      const limit = typeof params?.limit === 'number' && Number.isFinite(params.limit) ? Math.floor(params.limit) : 20;
      return store.listOperations({ limit, offset: 0, sort: 'desc' });
    },

    logs: async (params: { limit?: number }) => {
      const limit = typeof params?.limit === 'number' && Number.isFinite(params.limit) ? Math.floor(params.limit) : 50;
      if (limit <= 0) return [];
      return logBuffer.slice(-limit);
    },

    'sync-status': async () => {
      const status = sdk.sync.getStatus();
      const cursor = await store.getSyncCursor(chain.chainId).catch(() => undefined);
      return {
        chainId: chain.chainId,
        status: status?.[chain.chainId] ?? null,
        cursor: cursor ?? null,
        lastProgress: Array.from(lastSyncProgress.values())
          .filter((p) => p.chainId === chain.chainId)
          .sort((a, b) => a.resource.localeCompare(b.resource)),
      };
    },

    'set-sync-stream': async (params: { enabled?: boolean }) => {
      streamSyncLogs = Boolean(params?.enabled);
      return { enabled: streamSyncLogs };
    },

    'transfer-defaults': async (params: { token?: string }) => {
      await pauseSyncAndSyncOnce();
      const token = getToken(chain, params?.token);
      const maxEstimate = await sdk.planner.estimateMax({ chainId: chain.chainId, assetId: token.id, action: 'transfer' });
      const defaultAmount = maxEstimate.maxSummary.outputAmount;
      return {
        token: token.symbol,
        decimals: token.decimals,
        defaultAmount: defaultAmount > 0n ? formatAmount(defaultAmount, token.decimals) : undefined,
        maxAmount: defaultAmount.toString(),
      };
    },

    'transfer-preview': async (params: { token?: string; amount: string }) => {
      await pauseSyncAndSyncOnce();
      const token = getToken(chain, params?.token);
      const amountIn = params?.amount;
      if (!amountIn) throw new Error('missing amount');
      const amount = parseAmount(amountIn, token.decimals);
      const estimate = await sdk.planner.estimate({ chainId: chain.chainId, assetId: token.id, action: 'transfer', amount });
      const feeSummary = estimate.feeSummary;
      return {
        ok: estimate.okWithMerge,
        mergeCount: feeSummary.mergeCount,
        feeCount: feeSummary.feeCount,
        selectedCount: feeSummary.inputCount,
        relayerFee: {
          raw: feeSummary.relayerFeeTotal.toString(),
          formatted: formatAmount(feeSummary.relayerFeeTotal, token.decimals),
        },
        protocolFee: {
          raw: feeSummary.protocolFeeTotal.toString(),
          formatted: formatAmount(feeSummary.protocolFeeTotal, token.decimals),
        },
      };
    },

    transfer: async (params: { token?: string; amount: string; to?: string }) => {
      if (!chain.relayerUrl) throw new Error(`chain ${chain.chainId} missing relayerUrl`);
      if (!chain.rpcUrl) throw new Error(`chain ${chain.chainId} missing rpcUrl`);
      if (!chain.ocashContractAddress) throw new Error(`chain ${chain.chainId} missing ocashContractAddress`);
      if (!chain.merkleProofUrl) throw new Error(`chain ${chain.chainId} missing merkleProofUrl`);

      const token = getToken(chain, params?.token);
      const amountIn = params?.amount;
      if (!amountIn) throw new Error('missing amount');

      const toRaw = params?.to?.trim();
      const to = toRaw ? (toRaw as Hex) : selfViewingAddress;
      if (!isViewingAddress(to)) throw new Error('invalid to (expected 0x + 64 hex chars viewing address)');

      const { publicClient } = getClients(chain);
      pushLog({ level: 'info', scope: 'rpc:transfer', message: 'syncOnce:start' });
      await pauseSyncAndSyncOnce();
      try {
        pushLog({ level: 'info', scope: 'rpc:transfer', message: 'preflight:start' });
        await preflightContractReads(publicClient);
        const amount = parseAmount(amountIn, token.decimals);

        pushLog({ level: 'info', scope: 'rpc:transfer', message: 'prepareTransfer:start' });
        const prepared = await sdk.ops.prepareTransfer({
          chainId: chain.chainId,
          assetId: token.id,
          amount,
          to,
          ownerKeyPair: owner,
          publicClient,
          autoMerge: true,
        });
        if (prepared.kind === 'merge') {
          pushLog({
            level: 'warn',
            scope: 'rpc:transfer',
            message: 'prepareTransfer:merge-required',
            detail: { mergePlan: prepared.merge.plan, nextInput: prepared.nextInput },
          });
          return { mergeRequired: true };
        }
        pushLog({ level: 'info', scope: 'rpc:transfer', message: 'prepareTransfer:done', detail: prepared });

        pushLog({ level: 'info', scope: 'rpc:transfer', message: 'submitRelayerRequest:start' });
        const submit = await sdk.ops.submitRelayerRequest<Hex>({ prepared, publicClient, receiptTimeoutMs: 120_000 });
        pushLog({ level: 'info', scope: 'rpc:transfer', message: 'submitRelayerRequest:done', detail: { relayerTxHash: submit.result, operationId: submit.operationId } });

        pushLog({ level: 'info', scope: 'rpc:transfer', message: 'waitRelayerTxHash:start' });
        const txhash = await submit.waitRelayerTxHash;
        pushLog({ level: 'info', scope: 'rpc:transfer', message: 'waitRelayerTxHash:done', detail: { txhash } });

        pushLog({ level: 'info', scope: 'rpc:transfer', message: 'waitForTransactionReceipt:start' });
        const receipt = await submit.TransactionReceipt;
        const ok = receipt?.status === 'success';
        if (ok) {
          const selected = prepared.plan.selectedInputs;
          await sdk.wallet.markSpent({ chainId: chain.chainId, nullifiers: selected.map((u) => u.nullifier) });
        }
        pushLog({ level: 'info', scope: 'rpc:transfer', message: 'done', detail: { ok, operationId: submit.operationId } });

        return { operationId: submit.operationId, relayerTxHash: submit.result, txhash, ok };
      } finally {
        await resumeSync();
      }
    },

    'withdraw-preview': async (params: { token?: string; amount: string }) => {
      const token = getToken(chain, params?.token);
      const poolInfo = sdk.assets.getPoolInfo(chain.chainId, token.id);
      const amountIn = params?.amount;
      if (!amountIn) throw new Error('missing amount');
      const amount = parseAmount(amountIn, token.decimals);
      if (!poolInfo) throw new Error(`token ${token.id} pool info missing`);
      const estimate = await sdk.planner.estimate({ chainId: chain.chainId, assetId: token.id, action: 'withdraw', amount });
      const feeSummary = estimate.feeSummary;
      return {
        ok: estimate.okWithMerge,
        mergeCount: feeSummary.mergeCount,
        feeCount: feeSummary.feeCount,
        selectedCount: feeSummary.inputCount,
        relayerFee: {
          raw: feeSummary.relayerFeeTotal.toString(),
          formatted: formatAmount(feeSummary.relayerFeeTotal, token.decimals),
        },
        protocolFee: {
          raw: feeSummary.protocolFeeTotal.toString(),
          formatted: formatAmount(feeSummary.protocolFeeTotal, token.decimals),
        },
      };
    },

    withdraw: async (params: { token?: string; amount: string; recipient: string }) => {
      if (!chain.relayerUrl) throw new Error(`chain ${chain.chainId} missing relayerUrl`);
      if (!chain.ocashContractAddress) throw new Error(`chain ${chain.chainId} missing ocashContractAddress`);
      if (!chain.merkleProofUrl) throw new Error(`chain ${chain.chainId} missing merkleProofUrl`);

      const token = getToken(chain, params?.token);
      const amountIn = params?.amount;
      if (!amountIn) throw new Error('missing amount');

      const recipientIn = params?.recipient;
      if (!recipientIn) throw new Error('missing recipient');
      if (!isAddress(recipientIn)) throw new Error('invalid recipient');
      const recipient = getAddress(recipientIn);

      const { publicClient } = getClients(chain);
      pushLog({ level: 'info', scope: 'rpc:withdraw', message: 'syncOnce:start' });
      await pauseSyncAndSyncOnce();
      try {
        pushLog({ level: 'info', scope: 'rpc:withdraw', message: 'preflight:start' });
        await preflightContractReads(publicClient);
        const amount = parseAmount(amountIn, token.decimals);

        pushLog({ level: 'info', scope: 'rpc:withdraw', message: 'prepareWithdraw:start' });
        const prepared = await sdk.ops.prepareWithdraw({
          chainId: chain.chainId,
          assetId: token.id,
          amount,
          recipient,
          ownerKeyPair: owner,
          publicClient,
        });
        pushLog({ level: 'info', scope: 'rpc:withdraw', message: 'prepareWithdraw:done' });

        pushLog({ level: 'info', scope: 'rpc:withdraw', message: 'submitRelayerRequest:start' });
        const submit = await sdk.ops.submitRelayerRequest<Hex>({ prepared, publicClient, receiptTimeoutMs: 120_000 });
        pushLog({ level: 'info', scope: 'rpc:withdraw', message: 'submitRelayerRequest:done', detail: { relayerTxHash: submit.result, operationId: submit.operationId } });

        pushLog({ level: 'info', scope: 'rpc:withdraw', message: 'waitRelayerTxHash:start' });
        const txhash = await submit.waitRelayerTxHash;
        pushLog({ level: 'info', scope: 'rpc:withdraw', message: 'waitRelayerTxHash:done', detail: { txhash } });

        pushLog({ level: 'info', scope: 'rpc:withdraw', message: 'waitForTransactionReceipt:start' });
        const receipt = await submit.TransactionReceipt;
        const ok = receipt?.status === 'success';
        if (ok) {
          const utxo = prepared.plan.selectedInput;
          await sdk.wallet.markSpent({ chainId: chain.chainId, nullifiers: [utxo.nullifier] });
        }
        pushLog({ level: 'info', scope: 'rpc:withdraw', message: 'done', detail: { ok, operationId: submit.operationId } });

        return { operationId: submit.operationId, relayerTxHash: submit.result, txhash, ok };
      } finally {
        await resumeSync();
      }
    },

    shutdown: async () => {
      await shutdown();
      process.exit(0);
    },
  };

  process.on('message', async (msg: any) => {
    const req = msg as RpcRequest;
    if (!req || typeof req !== 'object' || typeof req.id !== 'string' || typeof req.method !== 'string') return;
    const handler = handlers[req.method];
    if (!handler) {
      reply({ id: req.id, ok: false, error: { message: `Unknown method: ${req.method}` } });
      return;
    }
    try {
      activeRpcDepth++;
      const result = await handler(req.params);
      reply({ id: req.id, ok: true, result });
    } catch (err) {
      pushLog({
        level: 'error',
        scope: `rpc:${req.method}`,
        message: err instanceof Error ? err.message : String(err),
      });
      fail(req.id, err);
    } finally {
      activeRpcDepth = Math.max(0, activeRpcDepth - 1);
    }
  });
}

await main();
