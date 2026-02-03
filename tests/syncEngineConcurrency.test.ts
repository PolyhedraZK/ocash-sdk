import { describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../src/sync/syncEngine';
import type { StorageAdapter } from '../src/types';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('SyncEngine (concurrency)', () => {
  it('syncs multiple chains in parallel (per-chain lock)', async () => {
    const m1 = deferred<any>();
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.startsWith('https://e1')) return m1.promise;
      if (url.startsWith('https://e2')) return { ok: true, json: async () => ({ data: { data: [{ commitment: '0x00', memo: '0x00', cid: 0 }], total: 1 } }) } as any;
      throw new Error(`unexpected url ${url}`);
    });
    (globalThis as any).fetch = fetchSpy;

    const assets = {
      getChains: () => [
        {
          chainId: 1,
          entryUrl: 'https://e1',
          ocashContractAddress: '0x0000000000000000000000000000000000000002',
        },
        {
          chainId: 2,
          entryUrl: 'https://e2',
          ocashContractAddress: '0x0000000000000000000000000000000000000002',
        },
      ],
      getChain: (id: number) =>
        id === 1
          ? { chainId: 1, entryUrl: 'https://e1', ocashContractAddress: '0x0000000000000000000000000000000000000002' }
          : { chainId: 2, entryUrl: 'https://e2', ocashContractAddress: '0x0000000000000000000000000000000000000002' },
    } as any;

    const setCalls: Array<{ chainId: number; cursor: any }> = [];
    const storage: StorageAdapter = {
      getSyncCursor: async () => ({ memo: 0, nullifier: 0, merkle: 0 }),
      setSyncCursor: async (chainId, cursor) => {
        setCalls.push({ chainId, cursor });
      },
      upsertUtxos: async () => undefined,
      listUtxos: async () => [],
      markSpent: async () => 0,
    };

    const wallet = {
      getViewingAddress: () => '0x0000000000000000000000000000000000000001',
      applyMemos: async () => 0,
      markSpent: async () => undefined,
    } as any;

    const engine = new SyncEngine(assets as any, storage, wallet, () => undefined, undefined);
    const task = engine.syncOnce({ chainIds: [1, 2], resources: ['memo'], continueOnError: false });

    // allow chain 2 to complete while chain 1 is still pending
    await new Promise((r) => setTimeout(r, 0));
    expect(setCalls.some((c) => c.chainId === 2 && c.cursor.memo === 1 && c.cursor.merkle === 0)).toBe(true);

    m1.resolve({
      ok: true,
      json: async () => ({ data: { data: [{ commitment: '0x00', memo: '0x00', cid: 0 }], total: 1 } }),
    });
    await task;
    expect(setCalls.some((c) => c.chainId === 1 && c.cursor.memo === 1 && c.cursor.merkle === 0)).toBe(true);
  });

  it('skips re-entrant sync on the same chain but still syncs others', async () => {
    const m1 = deferred<any>();
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.startsWith('https://e1')) return m1.promise;
      if (url.startsWith('https://e2')) return { ok: true, json: async () => ({ data: { data: [{ commitment: '0x00', memo: '0x00', cid: 0 }], total: 1 } }) } as any;
      throw new Error(`unexpected url ${url}`);
    });
    (globalThis as any).fetch = fetchSpy;

    const assets = {
      getChains: () => [
        {
          chainId: 1,
          entryUrl: 'https://e1',
          ocashContractAddress: '0x0000000000000000000000000000000000000002',
        },
        {
          chainId: 2,
          entryUrl: 'https://e2',
          ocashContractAddress: '0x0000000000000000000000000000000000000002',
        },
      ],
      getChain: (id: number) =>
        id === 1
          ? { chainId: 1, entryUrl: 'https://e1', ocashContractAddress: '0x0000000000000000000000000000000000000002' }
          : { chainId: 2, entryUrl: 'https://e2', ocashContractAddress: '0x0000000000000000000000000000000000000002' },
    } as any;

    const storage: StorageAdapter = {
      getSyncCursor: async () => ({ memo: 0, nullifier: 0, merkle: 0 }),
      setSyncCursor: async () => undefined,
      upsertUtxos: async () => undefined,
      listUtxos: async () => [],
      markSpent: async () => 0,
    };

    const wallet = {
      getViewingAddress: () => '0x0000000000000000000000000000000000000001',
      applyMemos: async () => 0,
      markSpent: async () => undefined,
    } as any;

    const events: any[] = [];
    const engine = new SyncEngine(assets as any, storage, wallet, (evt) => events.push(evt), undefined);
    const t1 = engine.syncOnce({ chainIds: [1], resources: ['memo'], continueOnError: false });
    const t2 = engine.syncOnce({ chainIds: [1, 2], resources: ['memo'], continueOnError: false });

    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSpy.mock.calls.filter((c) => String(c[0]).startsWith('https://e1')).length).toBe(1);
    expect(fetchSpy.mock.calls.filter((c) => String(c[0]).startsWith('https://e2')).length).toBe(1);
    expect(events.some((e) => e?.type === 'error' && e?.payload?.code === 'SYNC' && e?.payload?.detail?.skipped === true)).toBe(true);

    m1.resolve({
      ok: true,
      json: async () => ({ data: { data: [{ commitment: '0x00', memo: '0x00', cid: 0 }], total: 1 } }),
    });
    await Promise.all([t1, t2]);
  });
});
