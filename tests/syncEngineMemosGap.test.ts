import { describe, expect, it } from 'vitest';
import { SyncEngine } from '../src/sync/syncEngine';
import type { StorageAdapter } from '../src/types';

describe('SyncEngine (memos gaps)', () => {
  it('marks memo status as error when the first page skips the expected cid', async () => {
    (globalThis as any).fetch = async () => ({
      ok: true,
      json: async () => ({
        code: 0,
        data: { data: [{ commitment: '0x01', memo: '0x02', cid: 5, created_at: 1 }], total: 10 },
      }),
    });

    const assets = {
      getChains: () => [{ chainId: 1, entryUrl: 'https://entry.test', ocashContractAddress: '0x0000000000000000000000000000000000000002' }],
      getChain: () => ({ chainId: 1, entryUrl: 'https://entry.test', ocashContractAddress: '0x0000000000000000000000000000000000000002' }),
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

    const engine = new SyncEngine(assets as any, storage, wallet, () => undefined, undefined);
    await engine.syncOnce({ chainIds: [1], resources: ['memo'], continueOnError: false });

    expect(engine.getStatus()[1].memo.status).toBe('error');
    expect(engine.getStatus()[1].memo.errorMessage).toBe('EntryService memos are not contiguous');
  });

  it('applies contiguous memos then marks error when a gap is encountered', async () => {
    let calls = 0;
    (globalThis as any).fetch = async () => {
      calls++;
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            data: calls === 1 ? [{ commitment: '0x01', memo: '0x02', cid: 0, created_at: 1 }, { commitment: '0x03', memo: '0x04', cid: 2, created_at: 2 }] : [],
            total: 2,
          },
        }),
      };
    };

    const assets = {
      getChains: () => [{ chainId: 1, entryUrl: 'https://entry.test', ocashContractAddress: '0x0000000000000000000000000000000000000002' }],
      getChain: () => ({ chainId: 1, entryUrl: 'https://entry.test', ocashContractAddress: '0x0000000000000000000000000000000000000002' }),
    } as any;

    let savedCursor: any = null;
    const storage: StorageAdapter = {
      getSyncCursor: async () => ({ memo: 0, nullifier: 0, merkle: 0 }),
      setSyncCursor: async (_chainId, cursor) => {
        savedCursor = cursor;
      },
      upsertUtxos: async () => undefined,
      listUtxos: async () => [],
      markSpent: async () => 0,
    };

    let applied = 0;
    const wallet = {
      getViewingAddress: () => '0x0000000000000000000000000000000000000001',
      applyMemos: async (_chainId: number, memos: any[]) => {
        applied = memos.length;
        return memos.length;
      },
      markSpent: async () => undefined,
    } as any;

    const engine = new SyncEngine(assets as any, storage, wallet, () => undefined, undefined);
    await engine.syncOnce({ chainIds: [1], resources: ['memo'], continueOnError: false });

    expect(applied).toBe(1);
    expect(savedCursor?.memo).toBe(1);
    expect(engine.getStatus()[1].memo.status).toBe('error');
  });
});
