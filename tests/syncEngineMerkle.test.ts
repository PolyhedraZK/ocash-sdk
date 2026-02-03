import { describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../src/sync/syncEngine';
import type { StorageAdapter } from '../src/types';

describe('SyncEngine (merkle)', () => {
  it('does not allow merkle-only sync (merkle cursor is derived from memo sync)', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('unexpected fetch');
    });
    (globalThis as any).fetch = fetchSpy;

    const assets = {
      getChains: () => [{ chainId: 1 }],
      getChain: () => ({ chainId: 1 }),
    } as any;

    const setCursorSpy = vi.fn(async () => undefined);
    const storage: StorageAdapter = {
      getSyncCursor: async () => ({ memo: 0, nullifier: 0, merkle: 42 }),
      setSyncCursor: setCursorSpy,
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
    await engine.syncOnce({ chainIds: [1], resources: ['merkle'], continueOnError: false });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setCursorSpy).not.toHaveBeenCalled();
    expect(engine.getStatus()[1].merkle.status).toBe('error');
    expect(engine.getStatus()[1].merkle.cursor).toBe(42);
  });

  it('derives merkle cursor from memo cursor when syncing memos', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { data: [], total: 10 } }),
    }));
    (globalThis as any).fetch = fetchSpy;

    const assets = {
      getChains: () => [{ chainId: 1, entryUrl: 'https://entry.test', ocashContractAddress: '0x0000000000000000000000000000000000000002' }],
      getChain: () => ({ chainId: 1, entryUrl: 'https://entry.test', ocashContractAddress: '0x0000000000000000000000000000000000000002' }),
    } as any;

    let saved: any = null;
    const storage: StorageAdapter = {
      getSyncCursor: async () => ({ memo: 10, nullifier: 0, merkle: 999 }),
      setSyncCursor: async (_chainId, cursor) => {
        saved = cursor;
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
    await engine.syncOnce({ chainIds: [1], resources: ['memo'], continueOnError: false });

    expect(saved?.merkle).toBe(0);
  });
});
