import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import type { AnyAction } from 'redux';
import type { ThunkDispatch } from 'redux-thunk';
import { type Hex } from '@metamask/utils';
import { encodeFunctionData, createPublicClient, http, toHex } from 'viem';
import {
  createSdk,
  IndexedDbStore,
  type OCashSdk,
  type StoredOperation,
  type ChainConfigInput,
} from './sdk-bridge';
import {
  addTransactionAndRouteToConfirmationPage,
  getOcashSeedPhrase,
  isOcashUnlocked,
  findNetworkClientIdByChainId,
  unlockOcash,
} from '../../store/actions';
import {
  getOcashChainConfig,
  getOcashTokenConfig,
} from '../../constants/ocash';
import { getSelectedMultichainNetworkConfiguration } from '../../selectors';

export type OcashOperationType = 'deposit' | 'withdraw' | 'transfer';

type SubmitOperationInput = {
  kind: OcashOperationType;
  account: string;
  chainId: string;
  assetAddress: string;
  amount: string;
  recipient?: string;
  dispatch: ThunkDispatch<unknown, unknown, AnyAction>;
};

type SubmitOperationResult =
  | { ok: true; operation?: StoredOperation; txHash?: Hex }
  | { ok: false; error: string };

type GetReceiveAddressInput = {
  account: string;
  chainId: string;
};

type GetReceiveAddressResult =
  | { ok: true; address: Hex }
  | { ok: false; error: string };

type UnlockWalletInput = {
  account: string;
  chainId: string;
  password: string;
};

type UnlockWalletResult = { ok: true } | { ok: false; error: string };

type OcashSdkContext = {
  sdk: OCashSdk;
  chainConfig: ChainConfigInput;
  account: string;
  readyPromise?: Promise<void>;
  unlockedSeed?: string;
  syncPromise?: Promise<void>;
};

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

type OcashSyncState = {
  chainId?: string;
  status: SyncStatus;
  syncedCommitments: number;
  totalCommitments?: number;
  error?: string;
};

function formatSyncError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '同步失败');
  const httpMatch = raw.match(/HTTP\s+(\d{3})/i);
  const statusCode = httpMatch?.[1];
  const urlMatch = raw.match(/https?:\/\/[^\s<>"']+/i);
  const url = urlMatch?.[0];

  if (statusCode) {
    return url
      ? `EntryService 请求失败（HTTP ${statusCode}）：${url}`
      : `EntryService 请求失败（HTTP ${statusCode}）`;
  }

  const compact = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return compact || '同步失败';
}

const SDK_CONTEXTS = new Map<string, OcashSdkContext>();
const ACCOUNT_SEED_CACHE = new Map<string, string>();

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function normalizeChainId(chainId: string): string {
  if (chainId.startsWith('eip155:')) {
    const decimalChainId = Number(chainId.slice('eip155:'.length));
    if (Number.isFinite(decimalChainId)) {
      return `0x${decimalChainId.toString(16)}`;
    }
  }

  if (/^\d+$/u.test(chainId)) {
    const decimalChainId = Number(chainId);
    if (Number.isFinite(decimalChainId)) {
      return `0x${decimalChainId.toString(16)}`;
    }
  }

  return chainId.toLowerCase();
}

function parseAmountToUnits(input: string, decimals: number): bigint | null {
  const trimmed = input.trim();
  if (!trimmed || !/^(\d+(\.\d+)?|\.\d+)$/u.test(trimmed)) {
    return null;
  }

  const [intPartRaw, fracPartRaw = ''] = trimmed.split('.');
  const intPart = intPartRaw || '0';
  const fracPart = fracPartRaw.slice(0, decimals).padEnd(decimals, '0');
  const unitsText = `${intPart}${fracPart}`.replace(/^0+/u, '') || '0';

  try {
    return BigInt(unitsText);
  } catch {
    return null;
  }
}

function formatUnits(units: bigint, decimals: number): string {
  if (decimals === 0) {
    return units.toString();
  }

  const negative = units < 0n;
  const abs = negative ? -units : units;
  const text = abs.toString().padStart(decimals + 1, '0');
  const intPart = text.slice(0, -decimals);
  const fracPart = text.slice(-decimals).replace(/0+$/u, '');
  const formatted = fracPart ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${formatted}` : formatted;
}

function getContext(account: string, chainId: string): OcashSdkContext | null {
  const normalizedAccount = normalizeAddress(account);
  const normalizedChainId = normalizeChainId(chainId);
  const chain = getOcashChainConfig(normalizedChainId);
  if (!chain || !chain.rpcUrl) {
    return null;
  }

  const key = `${normalizedAccount}:${normalizedChainId}`;
  const existing = SDK_CONTEXTS.get(key);
  if (existing) {
    return existing;
  }

  const chainConfig: ChainConfigInput = {
    chainId: chain.chainIdDecimal,
    rpcUrl: chain.rpcUrl,
    entryUrl: chain.entryUrl,
    merkleProofUrl: chain.merkleProofUrl,
    ocashContractAddress: chain.ocashContractAddress as Hex | undefined,
    relayerUrl: chain.relayerUrl,
    tokens: chain.tokens,
  };

  const sdk = createSdk({
    runtime: 'browser',
    chains: [chainConfig],
    storage: new IndexedDbStore({
      dbName: `ocash-sdk-metamask-${chain.chainIdDecimal}`,
      storeName: 'ocash_store',
    }),
  });

  const created: OcashSdkContext = {
    sdk,
    chainConfig,
    account: normalizedAccount,
  };
  SDK_CONTEXTS.set(key, created);
  return created;
}

async function ensureReady(ctx: OcashSdkContext) {
  if (!ctx.readyPromise) {
    ctx.readyPromise = ctx.sdk.core.ready();
  }
  await ctx.readyPromise;
}

async function ensureUnlocked(
  ctx: OcashSdkContext,
  password?: string,
): Promise<string> {
  await ensureReady(ctx);
  let seed = ACCOUNT_SEED_CACHE.get(ctx.account);
  if (password) {
    await unlockOcash(password);
    seed = await getOcashSeedPhrase();
    ACCOUNT_SEED_CACHE.set(ctx.account, seed);
  }

  if (!seed) {
    seed = await getOcashSeedPhrase();
    ACCOUNT_SEED_CACHE.set(ctx.account, seed);
  }

  if (ctx.unlockedSeed !== seed) {
    await ctx.sdk.wallet.open({
      seed,
      walletId: ctx.account,
    });
    ctx.unlockedSeed = seed;
  }

  return seed;
}

async function resolveUnlockedSeed(
  account: string,
  password?: string,
): Promise<string> {
  const normalizedAccount = normalizeAddress(account);
  let seed = ACCOUNT_SEED_CACHE.get(normalizedAccount);

  if (password) {
    await unlockOcash(password);
    seed = await getOcashSeedPhrase();
    ACCOUNT_SEED_CACHE.set(normalizedAccount, seed);
  }

  if (!seed) {
    seed = await getOcashSeedPhrase();
    ACCOUNT_SEED_CACHE.set(normalizedAccount, seed);
  }

  return seed;
}

async function syncWallet(
  ctx: OcashSdkContext,
  options?: {
    onStart?: () => void;
    onProgress?: (progress: {
      syncedCommitments: number;
      totalCommitments?: number;
    }) => void;
    onDone?: () => void;
    onError?: (error: unknown) => void;
  },
) {
  if (!ctx.syncPromise) {
    const handleStart = (event: any) => {
      if (event?.payload?.chainId === ctx.chainConfig.chainId) {
        options?.onStart?.();
      }
    };
    const handleProgress = (event: any) => {
      if (event?.payload?.chainId !== ctx.chainConfig.chainId) return;
      if (event?.payload?.resource !== 'memo') return;
      const downloaded = Number(event?.payload?.downloaded ?? 0);
      const total = Number(event?.payload?.total ?? 0);
      if (Number.isFinite(downloaded)) {
        options?.onProgress?.({
          syncedCommitments: Math.max(0, Math.floor(downloaded)),
          totalCommitments:
            Number.isFinite(total) && total > 0 ? Math.max(0, Math.floor(total)) : undefined,
        });
      }
    };
    const handleDone = (event: any) => {
      if (event?.payload?.chainId === ctx.chainConfig.chainId) {
        const status = ctx.sdk.sync.getStatus()[ctx.chainConfig.chainId];
        const downloaded = Number(status?.memo?.downloaded ?? 0);
        const total = Number(status?.memo?.total ?? NaN);
        options?.onProgress?.({
          syncedCommitments: Number.isFinite(downloaded) ? Math.max(0, Math.floor(downloaded)) : 0,
          totalCommitments:
            Number.isFinite(total) && total >= 0 ? Math.floor(total) : undefined,
        });
        options?.onDone?.();
      }
    };
    ctx.syncPromise = ctx.sdk.sync
      .syncOnce({ chainIds: [ctx.chainConfig.chainId], continueOnError: true })
      .catch((error) => {
        options?.onError?.(error);
        throw error;
      })
      .finally(() => {
        ctx.sdk.core.off('sync:start', handleStart);
        ctx.sdk.core.off('sync:progress', handleProgress);
        ctx.sdk.core.off('sync:done', handleDone);
        ctx.syncPromise = undefined;
      });
    ctx.sdk.core.on('sync:start', handleStart);
    ctx.sdk.core.on('sync:progress', handleProgress);
    ctx.sdk.core.on('sync:done', handleDone);
  }
  await ctx.syncPromise;
}

function isAddress(input: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/u.test(input);
}

export function useOcashLedger(account?: string, chainId?: string) {
  const selectedChainId = useSelector(getSelectedMultichainNetworkConfiguration)?.chainId;
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [operations, setOperations] = useState<StoredOperation[]>([]);
  const [ocashUnlocked, setOcashUnlocked] = useState(false);
  const [syncState, setSyncState] = useState<OcashSyncState>({
    status: 'idle',
    syncedCommitments: 0,
  });

  const targetChainId = useMemo(() => {
    const raw = chainId ?? selectedChainId;
    if (!raw) return undefined;
    return normalizeChainId(raw);
  }, [chainId, selectedChainId]);

  const refresh = useCallback(async () => {
    if (!account) {
      setBalances({});
      setOperations([]);
      setSyncState({ status: 'idle', syncedCommitments: 0 });
      return;
    }
    if (!targetChainId) {
      setBalances({});
      setOperations([]);
      setSyncState({ status: 'idle', syncedCommitments: 0 });
      return;
    }

    const nextBalances: Record<string, bigint> = {};
    const nextOperations: StoredOperation[] = [];
    const unlocked = await isOcashUnlocked().catch(() => false);
    setOcashUnlocked(unlocked);
    if (!unlocked) {
      ACCOUNT_SEED_CACHE.clear();
    }

    const ctx = getContext(account, targetChainId);
    if (!ctx) {
      setBalances({});
      setOperations([]);
      setSyncState({
        chainId: targetChainId,
        status: 'error',
        syncedCommitments: 0,
        error: '当前网络不支持 OCash SDK。',
      });
      return;
    }

    try {
      await ensureUnlocked(ctx);
      await syncWallet(ctx, {
        onStart: () => {
          setSyncState((prev) => ({
            chainId: targetChainId,
            status: 'syncing',
            syncedCommitments: prev.chainId === targetChainId ? prev.syncedCommitments : 0,
            totalCommitments: prev.chainId === targetChainId ? prev.totalCommitments : undefined,
          }));
        },
        onProgress: (progress) => {
          setSyncState((prev) => ({
            chainId: targetChainId,
            status: 'syncing',
            syncedCommitments: progress.syncedCommitments,
            totalCommitments: progress.totalCommitments ?? prev.totalCommitments,
          }));
        },
        onDone: () => {
          setSyncState((prev) => ({
            chainId: targetChainId,
            status: 'synced',
            syncedCommitments: prev.syncedCommitments,
            totalCommitments: prev.totalCommitments,
          }));
        },
        onError: (error) => {
          setSyncState({
            chainId: targetChainId,
            status: 'error',
            syncedCommitments: 0,
            error: formatSyncError(error),
          });
        },
      });
      const status = ctx.sdk.sync.getStatus()[ctx.chainConfig.chainId];
      const downloaded = Number(status?.memo?.downloaded ?? 0);
      const total = Number(status?.memo?.total ?? NaN);
      setSyncState({
        chainId: targetChainId,
        status: status?.memo?.status === 'error' ? 'error' : 'synced',
        syncedCommitments: Number.isFinite(downloaded) ? Math.max(0, Math.floor(downloaded)) : 0,
        totalCommitments:
          Number.isFinite(total) && total >= 0 ? Math.floor(total) : undefined,
        error: status?.memo?.errorMessage ? formatSyncError(status.memo.errorMessage) : undefined,
      });
      const chain = getOcashChainConfig(targetChainId);
      if (chain) {
        await Promise.all(
          chain.tokens.map(async (token) => {
            const balance = await ctx.sdk.wallet.getBalance({
              chainId: chain.chainIdDecimal,
              assetId: token.id,
            });
            const key = `${targetChainId}:${normalizeAddress(token.wrappedErc20)}`;
            nextBalances[key] = balance;
          }),
        );

        const storedOps = ctx.sdk.storage
          .getAdapter()
          .listOperations({ chainId: chain.chainIdDecimal, sort: 'desc', limit: 50 });
        nextOperations.push(...storedOps);
      }
    } catch (error) {
      setSyncState({
        chainId: targetChainId,
        status: 'error',
        syncedCommitments: 0,
        error: formatSyncError(error),
      });
    }

    nextOperations.sort((a, b) => b.createdAt - a.createdAt);
    setBalances(nextBalances);
    setOperations(nextOperations);
  }, [account, targetChainId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!account || !targetChainId) return undefined;
    const timer = setInterval(() => {
      void refresh();
    }, 10_000);
    return () => clearInterval(timer);
  }, [account, targetChainId, refresh]);

  const getBalanceUnits = useCallback(
    (chainId: string, assetAddress: string) => {
      const key = `${normalizeChainId(chainId)}:${normalizeAddress(assetAddress)}`;
      return balances[key] ?? 0n;
    },
    [balances],
  );

  const getBalanceDisplay = useCallback(
    (chainId: string, assetAddress: string, decimals: number) =>
      formatUnits(getBalanceUnits(chainId, assetAddress), decimals),
    [getBalanceUnits],
  );

  const submitOperation = useCallback(
    async (input: SubmitOperationInput): Promise<SubmitOperationResult> => {
      const chainId = normalizeChainId(input.chainId);
      const chain = getOcashChainConfig(chainId);
      if (!chain || !chain.rpcUrl) {
        return { ok: false, error: '当前网络不支持 OCash SDK。' };
      }

      const token = getOcashTokenConfig(chainId, input.assetAddress);
      if (!token) {
        return { ok: false, error: '未找到 OCash 资产配置。' };
      }

      const amount = parseAmountToUnits(input.amount, token.decimals);
      if (!amount || amount <= 0n) {
        return { ok: false, error: '请输入有效数量。' };
      }

      const ctx = getContext(input.account, chainId);
      if (!ctx) {
        return { ok: false, error: 'OCash SDK 初始化失败。' };
      }

      try {
        const seed = await ensureUnlocked(ctx);
        await syncWallet(ctx);

        const publicClient = createPublicClient({
          transport: http(chain.rpcUrl),
        });

        if (input.kind === 'deposit') {
          const ownerPublicKey = ctx.sdk.keys.getPublicKeyBySeed(seed);
          const prepared = await ctx.sdk.ops.prepareDeposit({
            chainId: chain.chainIdDecimal,
            assetId: token.id,
            amount,
            ownerPublicKey,
            account: input.account as Hex,
            publicClient,
          });

          const networkClientId = await findNetworkClientIdByChainId(chainId);
          if (prepared.approveNeeded && prepared.approveRequest) {
            await input.dispatch(
              addTransactionAndRouteToConfirmationPage(
                {
                  from: input.account as Hex,
                  to: prepared.approveRequest.address,
                  data: encodeFunctionData({
                    abi: prepared.approveRequest.abi,
                    functionName: prepared.approveRequest.functionName,
                    args: prepared.approveRequest.args,
                  }),
                },
                { networkClientId },
              ),
            );
          }

          await input.dispatch(
            addTransactionAndRouteToConfirmationPage(
              {
                from: input.account as Hex,
                to: prepared.depositRequest.address,
                data: encodeFunctionData({
                  abi: prepared.depositRequest.abi,
                  functionName: prepared.depositRequest.functionName,
                  args: prepared.depositRequest.args,
                }),
                value:
                  prepared.depositRequest.value > 0n
                    ? toHex(prepared.depositRequest.value)
                    : undefined,
              },
              { networkClientId },
            ),
          );

          const operation = ctx.sdk.storage.getAdapter().createOperation({
            type: 'deposit',
            chainId: chain.chainIdDecimal,
            tokenId: token.id,
            detail: {
              token: token.symbol,
              amount: amount.toString(),
              protocolFee: prepared.protocolFee.toString(),
              depositRelayerFee: prepared.depositRelayerFee.toString(),
            },
          });

          await refresh();
          // Deposit is submitted via MetaMask confirmation flow; chain inclusion is async.
          // Retry sync a few times so balance catches up after confirmation.
          for (const delayMs of [5_000, 12_000, 24_000]) {
            setTimeout(() => {
              void refresh();
            }, delayMs);
          }
          return { ok: true, operation };
        }

        const ownerKeyPair = ctx.sdk.keys.deriveKeyPair(seed);
        if (input.kind === 'transfer') {
          if (!input.recipient || !isAddress(input.recipient)) {
            return { ok: false, error: '请输入有效收款地址。' };
          }

          const prepared = await ctx.sdk.ops.prepareTransfer({
            chainId: chain.chainIdDecimal,
            assetId: token.id,
            amount,
            to: input.recipient as Hex,
            ownerKeyPair,
            publicClient,
            autoMerge: true,
          });

          const transferPlan =
            prepared.kind === 'merge' ? prepared.merge : prepared;
          const submitted = await ctx.sdk.ops.submitRelayerRequest({
            prepared: {
              plan: transferPlan.plan,
              request: transferPlan.request,
              kind: transferPlan.kind,
            },
            publicClient,
          });

          const txHash = await submitted.waitRelayerTxHash;
          await syncWallet(ctx);
          await refresh();
          return { ok: true, txHash };
        }

        const prepared = await ctx.sdk.ops.prepareWithdraw({
          chainId: chain.chainIdDecimal,
          assetId: token.id,
          amount,
          recipient: input.account as Hex,
          ownerKeyPair,
          publicClient,
        });
        const submitted = await ctx.sdk.ops.submitRelayerRequest({
          prepared: {
            plan: prepared.plan,
            request: prepared.request,
          },
          publicClient,
        });
        const txHash = await submitted.waitRelayerTxHash;
        await syncWallet(ctx);
        await refresh();
        return { ok: true, txHash };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'OCash 操作失败。',
        };
      }
    },
    [refresh],
  );

  const getReceiveAddress = useCallback(
    async (input: GetReceiveAddressInput): Promise<GetReceiveAddressResult> => {
      const chainId = normalizeChainId(input.chainId);
      const chain = getOcashChainConfig(chainId);
      if (!chain || !chain.rpcUrl) {
        return { ok: false, error: '当前网络不支持 OCash SDK。' };
      }

      const ctx = getContext(input.account, chainId);
      if (!ctx) {
        return { ok: false, error: 'OCash SDK 初始化失败。' };
      }

      try {
        const seed = await resolveUnlockedSeed(input.account);
        const publicKey = ctx.sdk.keys.getPublicKeyBySeed(seed);
        const receiveAddress = ctx.sdk.keys.userPkToAddress(publicKey.user_pk);
        return { ok: true, address: receiveAddress };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : '获取 OCash 收款地址失败。',
        };
      }
    },
    [],
  );

  const unlockWallet = useCallback(
    async (input: UnlockWalletInput): Promise<UnlockWalletResult> => {
      const chainId = normalizeChainId(input.chainId);
      const chain = getOcashChainConfig(chainId);
      if (!chain || !chain.rpcUrl) {
        return { ok: false, error: '当前网络不支持 OCash SDK。' };
      }

      const ctx = getContext(input.account, chainId);
      if (!ctx) {
        return { ok: false, error: 'OCash SDK 初始化失败。' };
      }

      try {
        await ensureUnlocked(ctx, input.password);
        await syncWallet(ctx);
        await refresh();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : '解锁 OCash 失败。',
        };
      }
    },
    [refresh],
  );

  const hasUnlockedSeed = useMemo(() => {
    if (!account) {
      return false;
    }
    return ocashUnlocked || ACCOUNT_SEED_CACHE.has(normalizeAddress(account));
  }, [account, ocashUnlocked]);

  return {
    getBalanceUnits,
    getBalanceDisplay,
    operations,
    submitOperation,
    getReceiveAddress,
    unlockWallet,
    refresh,
    hasUnlockedSeed,
    syncState,
  };
}
