import { describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../src/sync/syncEngine';

describe('SyncEngine', () => {
  it('emits a CONFIG error when wallet is not opened', async () => {
    const emit = vi.fn();
    const assets = {
      getChains: () => [{ chainId: 1, entryUrl: 'https://entry.example', ocashContractAddress: '0x0000000000000000000000000000000000000002' }],
      getChain: () => ({ chainId: 1, entryUrl: 'https://entry.example', ocashContractAddress: '0x0000000000000000000000000000000000000002' }),
    };
    const storage = {
      getSyncCursor: vi.fn(async () => undefined),
      setSyncCursor: vi.fn(async () => undefined),
    };
    const wallet = {
      getViewingAddress: vi.fn(() => {
        throw new Error('Wallet is not opened');
      }),
      applyMemos: vi.fn(),
      markSpent: vi.fn(),
    };

    const engine = new SyncEngine(assets as any, storage as any, wallet as any, emit, undefined);
    await engine.syncOnce({ chainIds: [1], resources: ['memo'], continueOnError: true });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({ code: 'CONFIG', message: 'Wallet is not opened' }),
      }),
    );
  });
});
