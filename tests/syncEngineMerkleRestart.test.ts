import { describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../src/sync/syncEngine';
import { MerkleEngine } from '../src/merkle/merkleEngine';
import type { StorageAdapter } from '../src/types';

describe('SyncEngine (merkle restart)', () => {
  it('does not fail memo sync in hybrid mode when local merkle tree lacks history', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          data: [
            { commitment: '0x01', memo: '0x02', cid: 10, created_at: 1 },
            { commitment: '0x03', memo: '0x04', cid: 11, created_at: 2 },
          ],
          total: 12,
        },
      }),
    }));
    (globalThis as any).fetch = fetchSpy;

    const assets = {
      getChains: () => [{ chainId: 1, entryUrl: 'https://entry.test', ocashContractAddress: '0x0000000000000000000000000000000000000002' }],
      getChain: () => ({ chainId: 1, entryUrl: 'https://entry.test', ocashContractAddress: '0x0000000000000000000000000000000000000002' }),
    } as any;

    let saved: any = null;
    const storage: StorageAdapter = {
      getSyncCursor: async () => ({ memo: 10, nullifier: 0, merkle: 9 }),
      setSyncCursor: async (_chainId, cursor) => {
        saved = cursor;
      },
      upsertUtxos: async () => undefined,
      listUtxos: async () => ({ total: 0, rows: [] }),
      markSpent: async () => 0,
    };

    const wallet = {
      getViewingAddress: () => '0x0000000000000000000000000000000000000001',
      applyMemos: async () => 0,
      markSpent: async () => undefined,
    } as any;

    const merkle = new MerkleEngine(() => ({}), {} as any, { mode: 'hybrid' });
    const engine = new SyncEngine(assets as any, storage, wallet, () => undefined, merkle);

    await engine.syncOnce({ chainIds: [1], resources: ['memo'], continueOnError: false });

    expect(engine.getStatus()[1].memo.status).toBe('synced');
    expect(saved?.memo).toBe(12);
    expect(saved?.merkle).toBe(0);
  });
});
