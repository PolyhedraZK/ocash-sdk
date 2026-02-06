import type { AssetsApi, StorageAdapter, SyncApi, SyncChainStatus, SyncCursor } from '../types';
import { SdkError } from '../errors';
import { EntryClient } from './entryClient';
import { WalletService } from '../wallet/walletService';
import type { MerkleEngine } from '../merkle/merkleEngine';

const DEFAULT_PAGE_SIZE = 512;
const DEFAULT_POLL_MS = 15_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const MERKLE_TEMP_ARRAY_SIZE_DEFAULT = 32;

export type SyncEngineOptions = {
  pageSize?: number;
  pollMs?: number;
  requestTimeoutMs?: number;
  retry?: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number };
};

type NormalizedSyncEngineOptions = Omit<Required<SyncEngineOptions>, 'retry'> & {
  retry: { attempts: number; baseDelayMs: number; maxDelayMs: number };
};

const toBoundedInt = (value: unknown, fallback: number, bounds: { min: number; max?: number }): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const floored = Math.floor(value);
  if (!Number.isFinite(floored)) return fallback;
  const max = bounds.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(bounds.min, floored));
};

const normalizeSyncEngineOptions = (options?: SyncEngineOptions): NormalizedSyncEngineOptions => {
  const merged = {
    pageSize: DEFAULT_PAGE_SIZE,
    pollMs: DEFAULT_POLL_MS,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    retry: {},
    ...(options ?? {}),
  };
  const retryAttempts = merged.retry?.attempts;
  const retryBaseDelayMs = merged.retry?.baseDelayMs;
  const retryMaxDelayMs = merged.retry?.maxDelayMs;
  return {
    pageSize: toBoundedInt(merged.pageSize, DEFAULT_PAGE_SIZE, { min: 1 }),
    pollMs: toBoundedInt(merged.pollMs, DEFAULT_POLL_MS, { min: 250 }),
    requestTimeoutMs: toBoundedInt(merged.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, { min: 1000 }),
    retry: {
      attempts: retryAttempts == null ? 1 : toBoundedInt(retryAttempts, 1, { min: 1 }),
      baseDelayMs: retryBaseDelayMs == null ? 250 : toBoundedInt(retryBaseDelayMs, 250, { min: 0 }),
      maxDelayMs: retryMaxDelayMs == null ? 5_000 : toBoundedInt(retryMaxDelayMs, 5_000, { min: 0 }),
    },
  };
};

const defaultCursor = (): SyncCursor => ({ memo: 0, nullifier: 0, merkle: 0 });

// Merkle cursor represents the current merkle root index (not leaf/cid).
// The on-chain accumulator advances the root index in fixed batches (default 32 leaves).
const currentMerkleRootIndex = (totalElements: number, tempArraySize = MERKLE_TEMP_ARRAY_SIZE_DEFAULT) => {
  if (!Number.isFinite(totalElements) || totalElements <= 0) return 0;
  if (totalElements <= tempArraySize) return 0;
  return Math.floor((totalElements - 1) / tempArraySize);
};

const sanitizeContiguousMemos = <T extends { cid: number | null }>(memos: T[], expectedCid: number): T[] => {
  const sorted = memos.filter((m): m is T & { cid: number } => typeof m.cid === 'number').sort((a, b) => a.cid - b.cid);
  const contiguous: T[] = [];
  let next = expectedCid;
  for (const memo of sorted) {
    if (memo.cid < next) continue;
    if (memo.cid > next) break;
    contiguous.push(memo as T);
    next++;
  }
  return contiguous;
};

const minCid = (memos: Array<{ cid: number | null }>): number | null => {
  let min: number | null = null;
  for (const memo of memos) {
    const cid = memo.cid;
    if (typeof cid !== 'number' || !Number.isFinite(cid)) continue;
    if (min == null || cid < min) min = cid;
  }
  return min;
};

const sampleCids = (memos: Array<{ cid: number | null }>, limit = 10): number[] => {
  const out = memos
    .map((m) => m.cid)
    .filter((cid): cid is number => typeof cid === 'number' && Number.isFinite(cid))
    .sort((a, b) => a - b);
  return out.slice(0, limit);
};

const signalTimeout = (ms: number): AbortSignal => {
  const anyAbortSignal = AbortSignal as any;
  if (typeof anyAbortSignal?.timeout === 'function') return anyAbortSignal.timeout(ms) as AbortSignal;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error('timeout')), ms);
  controller.signal.addEventListener('abort', () => clearTimeout(t), { once: true });
  return controller.signal;
};

const signalAny = (signals: Array<AbortSignal | undefined>): AbortSignal | undefined => {
  const list = signals.filter(Boolean) as AbortSignal[];
  if (!list.length) return undefined;
  const anyAbortSignal = AbortSignal as any;
  if (typeof anyAbortSignal?.any === 'function') return anyAbortSignal.any(list) as AbortSignal;
  const controller = new AbortController();
  const onAbort = (s: AbortSignal) => controller.abort((s as any).reason);
  for (const s of list) {
    if (s.aborted) {
      onAbort(s);
      break;
    }
    s.addEventListener('abort', () => onAbort(s), { once: true });
  }
  return controller.signal;
};

const findDuplicate = (values: string[]): string | null => {
  const seen = new Set<string>();
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) return v;
    seen.add(key);
  }
  return null;
};

const stringifyError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const formatSyncErrorMessage = (error: unknown): string => {
  if (error instanceof SdkError) {
    const base = error.message;
    const detail = error.detail as any;
    const status = detail?.status;
    const url = detail?.url;
    if (typeof status === 'number' && typeof url === 'string') {
      const statusText = typeof detail?.statusText === 'string' && detail.statusText.length ? ` ${detail.statusText}` : '';
      const bodyMessage =
        typeof detail?.bodyJson?.message === 'string'
          ? detail.bodyJson.message
          : typeof detail?.bodyJson?.error === 'string'
            ? detail.bodyJson.error
            : typeof detail?.bodyText === 'string' && detail.bodyText.length
              ? detail.bodyText
              : undefined;
      const extra = bodyMessage ? `: ${String(bodyMessage).slice(0, 240)}` : '';
      return `${base} (HTTP ${status}${statusText}) ${url}${extra}`;
    }
    if (typeof url === 'string') {
      const causeMsg = error.cause && typeof (error.cause as any)?.message === 'string' ? `: ${(error.cause as any).message}` : '';
      return `${base} ${url}${causeMsg}`;
    }
    return base;
  }
  return stringifyError(error);
};

export class SyncEngine implements SyncApi {
  private readonly status: Record<number, SyncChainStatus> = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly runningChains = new Set<number>();
  private readonly options: NormalizedSyncEngineOptions;

  constructor(
    private readonly assets: AssetsApi,
    private readonly storage: StorageAdapter,
    private readonly wallet: WalletService,
    private readonly emit: (evt: any) => void,
    private readonly merkle?: Pick<MerkleEngine, 'ingestEntryMemos'>,
    options?: SyncEngineOptions,
  ) {
    this.options = normalizeSyncEngineOptions(options);
  }

  getStatus() {
    return { ...this.status };
  }

  async start(options?: { chainIds?: number[]; pollMs?: number }) {
    if (this.timer) return;
    await this.syncOnce({ chainIds: options?.chainIds, continueOnError: true });
    const pollMs = options?.pollMs != null ? toBoundedInt(options.pollMs, this.options.pollMs, { min: 250 }) : this.options.pollMs;
    this.timer = setInterval(() => {
      if (this.runningChains.size) return;
      void this.syncOnce({ chainIds: options?.chainIds, continueOnError: true }).catch(() => undefined);
    }, pollMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async syncOnce(options?: { chainIds?: number[]; resources?: Array<'memo' | 'nullifier' | 'merkle'>; signal?: AbortSignal; requestTimeoutMs?: number; pageSize?: number; continueOnError?: boolean }) {
    const chainIds = options?.chainIds ?? this.assets.getChains().map((c) => c.chainId);
    const requestTimeoutMs = toBoundedInt(options?.requestTimeoutMs, this.options.requestTimeoutMs, { min: 1000 });
    const pageSize = toBoundedInt(options?.pageSize, this.options.pageSize, { min: 1 });
    const tasks = chainIds.map((chainId) => {
      if (options?.signal?.aborted) {
        return Promise.reject(options.signal.reason ?? new SdkError('SYNC', 'Aborted'));
      }
      if (this.runningChains.has(chainId)) {
        this.emit({
          type: 'error',
          payload: {
            code: 'SYNC',
            message: 'Sync skipped: chain already syncing',
            detail: { chainId, skipped: true },
          },
        });
        return Promise.resolve();
      }
      this.runningChains.add(chainId);
      return this.syncChain(chainId, options?.resources, {
        signal: options?.signal,
        requestTimeoutMs,
        pageSize,
      }).finally(() => {
        this.runningChains.delete(chainId);
      });
    });

    if (options?.continueOnError) {
      await Promise.all(tasks.map((t) => t.catch(() => undefined)));
      return;
    }
    await Promise.all(tasks);
  }

  private initChainStatus(chainId: number): SyncChainStatus {
    return (
      this.status[chainId] ??
      (this.status[chainId] = {
        memo: { status: 'idle', downloaded: 0 },
        nullifier: { status: 'idle', downloaded: 0 },
        merkle: { status: 'idle', cursor: 0 },
      })
    );
  }

  private async syncChain(chainId: number, resources?: Array<'memo' | 'nullifier' | 'merkle'>, options?: { signal?: AbortSignal; requestTimeoutMs: number; pageSize: number }) {
    const chain = this.assets.getChain(chainId);
    const cursor = (await this.storage.getSyncCursor(chainId)) ?? defaultCursor();
    this.emit({
      type: 'debug',
      payload: {
        scope: 'sync',
        message: 'syncChain:init',
        detail: {
          chainId,
          resources: resources ?? ['memo', 'nullifier', 'merkle'],
          cursor,
          pageSize: options?.pageSize,
          requestTimeoutMs: options?.requestTimeoutMs,
        },
      },
    });

    const enabled = new Set(resources ?? ['memo', 'nullifier', 'merkle']);
    const status = this.initChainStatus(chainId);
    this.emit({ type: 'sync:start', payload: { chainId, source: 'entry' } });
    let hadError = false;
    try {
      // `cursor.merkle` tracks the merkle root index cursor, derived from memo sync (total elements).
      // Proof fetching is on-demand during transfer/withdraw and is not part of sync.
      if (enabled.has('merkle') && !enabled.has('memo')) {
        hadError = true;
        status.merkle = {
          status: 'error',
          cursor: cursor.merkle,
          errorMessage: 'Merkle sync is derived from memo sync; include resource "memo"',
        };
        this.emit({
          type: 'error',
          payload: {
            code: 'SYNC',
            message: status.merkle.errorMessage,
            detail: { chainId, resource: 'merkle', reason: 'requires_memo' },
          },
        });
      }

      const needsEntry = enabled.has('memo') || enabled.has('nullifier');
      const client = needsEntry ? (chain.entryUrl ? new EntryClient(chain.entryUrl, (e) => this.emit(e)) : null) : null;
      let viewingAddress: string | null = null;
      const contractAddress = (chain.ocashContractAddress ?? chain.contract) as string | undefined;
      if (needsEntry) {
        try {
          viewingAddress = this.wallet.getViewingAddress();
          this.emit({
            type: 'debug',
            payload: { scope: 'sync', message: 'wallet:viewingAddress', detail: { chainId, viewingAddress } },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (enabled.has('memo')) status.memo = { status: 'error', downloaded: cursor.memo, errorMessage: message };
          if (enabled.has('nullifier')) status.nullifier = { status: 'error', downloaded: cursor.nullifier, errorMessage: message };
          this.emit({
            type: 'error',
            payload: { code: 'CONFIG', message, detail: { chainId, resource: 'entry', reason: 'wallet_not_open' }, cause: error },
          });
          hadError = true;
          return;
        }
      }
      if (needsEntry && !client) {
        const message = `Chain ${chainId} missing entryUrl`;
        if (enabled.has('memo')) status.memo = { status: 'error', downloaded: cursor.memo, errorMessage: message };
        if (enabled.has('nullifier')) status.nullifier = { status: 'error', downloaded: cursor.nullifier, errorMessage: message };
        this.emit({
          type: 'error',
          payload: { code: 'CONFIG', message, detail: { chainId, resource: 'entry', reason: 'missing_entryUrl' } },
        });
        hadError = true;
        return;
      }
      if (needsEntry && !contractAddress) {
        const message = `Chain ${chainId} missing ocashContractAddress`;
        if (enabled.has('memo')) status.memo = { status: 'error', downloaded: cursor.memo, errorMessage: message };
        if (enabled.has('nullifier')) status.nullifier = { status: 'error', downloaded: cursor.nullifier, errorMessage: message };
        this.emit({
          type: 'error',
          payload: { code: 'CONFIG', message, detail: { chainId, resource: 'entry', reason: 'missing_ocashContractAddress' } },
        });
        hadError = true;
        return;
      }
      if (needsEntry) {
        this.emit({
          type: 'debug',
          payload: { scope: 'sync', message: 'entry:contractAddress', detail: { chainId, contractAddress } },
        });
      }

      if (enabled.has('memo')) {
        try {
          status.memo = { status: 'syncing', downloaded: cursor.memo };
          if (enabled.has('merkle')) status.merkle = { status: 'syncing', cursor: cursor.merkle };

          // Derive merkle root-index cursor from the memo cursor (total elements).
          // This keeps cursor/status consistent even when there are no new memos in the current run.
          const derivedMerkleCursor = currentMerkleRootIndex(cursor.memo);
          if (cursor.merkle !== derivedMerkleCursor) {
            cursor.merkle = derivedMerkleCursor;
            await this.storage.setSyncCursor(chainId, cursor);
          }
          if (enabled.has('merkle')) status.merkle.cursor = cursor.merkle;

          let offset = cursor.memo;
          while (true) {
            if (options?.signal?.aborted) throw options.signal.reason ?? new SdkError('SYNC', 'Aborted');
            const signal = signalAny([options?.signal, signalTimeout(options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)]);
            const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
            this.emit({ type: 'debug', payload: { scope: 'sync:memo', message: 'page:request', detail: { chainId, offset, limit: pageSize } } });
            const page = await this.withRetries(() => client!.listMemos({ chainId, address: contractAddress!, offset, limit: pageSize, signal }), { chainId, resource: 'memo', signal });
            status.memo.total = page.total;
            const contiguous = sanitizeContiguousMemos(page.items, offset);
            if (page.items.length > 0 && contiguous.length === 0) {
              throw new SdkError('SYNC', 'EntryService memos are not contiguous', {
                chainId,
                expectedCid: offset,
                firstCid: minCid(page.items),
                cids: sampleCids(page.items),
                returned: page.items.length,
                total: page.total,
              });
            }
            this.emit({ type: 'sync:progress', payload: { chainId, resource: 'memo', downloaded: offset, total: page.total } });
            if (!contiguous.length) break;
            if (this.storage.upsertEntryMemos) {
              try {
                await this.storage.upsertEntryMemos(
                  contiguous
                    .filter((m): m is typeof m & { cid: number } => typeof m.cid === 'number' && Number.isInteger(m.cid) && m.cid >= 0)
                    .map((m) => ({
                      chainId,
                      cid: m.cid as number,
                      commitment: m.commitment,
                      memo: m.memo,
                      isTransparent: m.is_transparent ?? undefined,
                      assetId: m.asset_id ?? undefined,
                      amount: m.amount ?? undefined,
                      partialHash: m.partial_hash ?? undefined,
                      txHash: m.txhash ?? undefined,
                      createdAt: m.created_at ?? null,
                    })),
                );
              } catch {
                // best-effort cache
              }
            }
            await this.merkle?.ingestEntryMemos?.(chainId, contiguous);
            const added = await this.wallet.applyMemos(chainId, contiguous);
            this.emit({
              type: 'debug',
              payload: { scope: 'sync:memo', message: 'page:applied', detail: { chainId, offset, returned: page.items.length, contiguous: contiguous.length, added } },
            });
            const lastCid = contiguous[contiguous.length - 1]!.cid as number;
            offset = lastCid + 1;
            cursor.memo = offset;
            // Update merkle root-index cursor from total elements.
            cursor.merkle = currentMerkleRootIndex(offset);
            await this.storage.setSyncCursor(chainId, cursor);
            status.memo.downloaded = offset;
            if (enabled.has('merkle')) status.merkle.cursor = cursor.merkle;
            if (contiguous.length < page.items.length) {
              throw new SdkError('SYNC', 'EntryService memos are not contiguous', {
                chainId,
                expectedCid: offset,
                firstCid: minCid(page.items),
                cids: sampleCids(page.items),
                contiguousApplied: contiguous.length,
                returned: page.items.length,
                total: page.total,
              });
            }
            if (contiguous.length < pageSize) break;
          }
          status.memo.status = 'synced';
          if (enabled.has('merkle')) status.merkle.status = 'synced';
        } catch (error) {
          hadError = true;
          status.memo = {
            status: 'error',
            downloaded: status.memo.downloaded ?? cursor.memo,
            errorMessage: formatSyncErrorMessage(error),
          };
          this.emit({ type: 'error', payload: { code: 'SYNC', message: status.memo.errorMessage, detail: { chainId, resource: 'memo' }, cause: error } });
          if (enabled.has('merkle')) {
            status.merkle = {
              status: 'error',
              cursor: status.merkle.cursor ?? cursor.merkle,
              errorMessage: status.memo.errorMessage,
            };
            this.emit({
              type: 'error',
              payload: { code: 'SYNC', message: status.merkle.errorMessage, detail: { chainId, resource: 'merkle', reason: 'memo_failed' }, cause: error },
            });
          }
        }
      }

      if (enabled.has('nullifier')) {
        try {
          status.nullifier = { status: 'syncing', downloaded: cursor.nullifier };
          let offset = cursor.nullifier;
          while (true) {
            if (options?.signal?.aborted) throw options.signal.reason ?? new SdkError('SYNC', 'Aborted');
            const signal = signalAny([options?.signal, signalTimeout(options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)]);
            const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
            this.emit({
              type: 'debug',
              payload: { scope: 'sync:nullifier', message: 'page:request', detail: { chainId, offset, limit: pageSize, endpoint: 'list_by_block' } },
            });
            const page = await this.withRetries(() => client!.listNullifiersByBlock({ chainId, address: contractAddress!, offset, limit: pageSize, signal }), {
              chainId,
              resource: 'nullifier',
              signal,
            });
            status.nullifier.total = page.total;
            this.emit({
              type: 'sync:progress',
              payload: { chainId, resource: 'nullifier', downloaded: offset, total: page.total },
            });
            if (!page.items.length) {
              if (page.total > offset) {
                if ((page as any).ready === false) break;
                throw new SdkError('SYNC', 'EntryService nullifiers returned empty page before reaching total', { chainId, offset, total: page.total, limit: pageSize });
              }
              break;
            }
            const duplicate = findDuplicate(page.items.map((n) => n.nullifier));
            if (duplicate) {
              throw new SdkError('SYNC', 'EntryService nullifiers contain duplicates', { chainId, offset, duplicate });
            }
            if (this.storage.upsertEntryNullifiers) {
              try {
                await this.storage.upsertEntryNullifiers(
                  page.items.map((n, idx) => ({
                    chainId,
                    nid: offset + idx,
                    nullifier: n.nullifier,
                    createdAt: (n as any).created_at ?? null,
                  })),
                );
              } catch {
                // best-effort cache
              }
            }
            await this.wallet.markSpent({ chainId, nullifiers: page.items.map((n) => n.nullifier) });
            this.emit({
              type: 'debug',
              payload: { scope: 'sync:nullifier', message: 'page:applied', detail: { chainId, offset, returned: page.items.length, total: page.total, ready: (page as any).ready } },
            });
            offset += page.items.length;
            cursor.nullifier = offset;
            await this.storage.setSyncCursor(chainId, cursor);
            status.nullifier.downloaded = offset;
            if (page.items.length < pageSize) break;
          }
          status.nullifier.status = 'synced';
        } catch (error) {
          hadError = true;
          status.nullifier = {
            status: 'error',
            downloaded: status.nullifier.downloaded ?? cursor.nullifier,
            errorMessage: formatSyncErrorMessage(error),
          };
          this.emit({
            type: 'error',
            payload: { code: 'SYNC', message: status.nullifier.errorMessage, detail: { chainId, resource: 'nullifier' }, cause: error },
          });
        }
      }
    } finally {
      this.emit({ type: 'sync:done', payload: { chainId, cursor } });
    }
  }

  private async withRetries<T>(fn: () => Promise<T>, meta: { chainId: number; resource: 'memo' | 'nullifier' | 'merkle'; signal?: AbortSignal }): Promise<T> {
    const attempts = this.options.retry.attempts;
    const baseDelayMs = this.options.retry.baseDelayMs;
    const maxDelayMs = this.options.retry.maxDelayMs;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (meta.signal?.aborted) throw (meta.signal as any).reason ?? new SdkError('SYNC', 'Aborted');
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const retryable = this.shouldRetry(error);
        if (!retryable || attempt >= attempts) break;
        const delay = Math.min(maxDelayMs, Math.floor(baseDelayMs * Math.min(32, 2 ** (attempt - 1))));
        this.emit({
          type: 'error',
          payload: {
            code: 'SYNC',
            message: 'Sync request failed, retrying',
            detail: { chainId: meta.chainId, resource: meta.resource, attempt, delayMs: delay },
            cause: error,
          },
        });
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, delay);
          const onAbort = () => {
            clearTimeout(t);
            reject((meta.signal as any).reason ?? new SdkError('SYNC', 'Aborted'));
          };
          if (meta.signal) {
            if (meta.signal.aborted) return onAbort();
            meta.signal.addEventListener('abort', onAbort, { once: true });
          }
        });
      }
    }
    throw lastError;
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof SdkError) {
      const status = (error.detail as any)?.status;
      if (typeof status === 'number') {
        if (status === 429) return true;
        if (status >= 500) return true;
        return false;
      }
      // If there's no HTTP status, assume it's not a transient transport issue.
      return false;
    }
    return true;
  }
}
