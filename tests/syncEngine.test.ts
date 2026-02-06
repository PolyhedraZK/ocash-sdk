import { describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../src/sync/syncEngine';
import type { StorageAdapter } from '../src/types';

describe('SyncEngine', () => {
  it('sets status to error when entry request fails', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 500 }));
    (globalThis as any).fetch = fetchSpy;

    const assets = {
      getChains: () => [{ chainId: 1, entryUrl: 'https://entry.test', ocashContractAddress: '0x0000000000000000000000000000000000000002' }],
      getChain: () => ({ chainId: 1, entryUrl: 'https://entry.test', ocashContractAddress: '0x0000000000000000000000000000000000000002' }),
    } as any;

    const storage: StorageAdapter = {
      getSyncCursor: async () => ({ memo: 0, nullifier: 0, merkle: 0 }),
      setSyncCursor: async () => undefined,
      upsertUtxos: async () => undefined,
      listUtxos: async () => ({ total: 0, rows: [] }),
      markSpent: async () => 0,
    };

    const wallet = {
      getViewingAddress: () => '0x0000000000000000000000000000000000000001',
      applyMemos: async () => 0,
      markSpent: async () => undefined,
    } as any;

    const events: any[] = [];
    const engine = new SyncEngine(assets as any, storage, wallet, (evt) => events.push(evt), undefined);
    await engine.syncOnce({ chainIds: [1], resources: ['memo'], continueOnError: false });

    const status = engine.getStatus()[1];
    expect(status.memo.status).toBe('error');
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });
});
