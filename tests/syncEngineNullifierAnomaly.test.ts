import { describe, expect, it } from 'vitest';
import { SyncEngine } from '../src/sync/syncEngine';
import type { StorageAdapter } from '../src/types';

describe('SyncEngine (nullifier anomalies)', () => {
  it('marks nullifier status as error when total>offset but page is empty', async () => {
    (globalThis as any).fetch = async () => ({
      ok: true,
      json: async () => ({
        code: 0,
        data: { data: [], total: 10 },
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
    await engine.syncOnce({ chainIds: [1], resources: ['nullifier'], continueOnError: false });

    expect(engine.getStatus()[1].nullifier.status).toBe('error');
    expect(engine.getStatus()[1].nullifier.errorMessage).toBe('EntryService nullifiers returned empty page before reaching total');
  });

  it('marks nullifier status as error when page contains duplicates', async () => {
    (globalThis as any).fetch = async () => ({
      ok: true,
      json: async () => ({
        code: 0,
        data: { data: [{ nullifier: '0x01' }, { nullifier: '0x01' }], total: 2 },
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
    await engine.syncOnce({ chainIds: [1], resources: ['nullifier'], continueOnError: false });

    expect(engine.getStatus()[1].nullifier.status).toBe('error');
    expect(engine.getStatus()[1].nullifier.errorMessage).toBe('EntryService nullifiers contain duplicates');
  });
});
