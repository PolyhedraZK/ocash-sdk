import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memoryStore';

describe('MemoryStore', () => {
  it('does not leak state when switching walletId', async () => {
    const store = new MemoryStore();

    store.init({ walletId: 'wallet_a' });
    await store.setSyncCursor(1, { memo: 1, nullifier: 2, merkle: 3 });
    store.createOperation({ type: 'deposit', chainId: 1, tokenId: 'T' });

    store.init({ walletId: 'wallet_b' });
    await expect(store.getSyncCursor(1)).resolves.toBeUndefined();
    await expect(store.listUtxos({ chainId: 1 })).resolves.toEqual({ total: 0, rows: [] });
    expect(store.listOperations()).toEqual([]);
  });

  it('supports pruning and deleting operations', () => {
    const store = new MemoryStore({ maxOperations: 2 });

    const op1 = store.createOperation({ type: 'deposit', chainId: 1, tokenId: 'T' });
    const op2 = store.createOperation({ type: 'transfer', chainId: 1, tokenId: 'T' });
    store.createOperation({ type: 'withdraw', chainId: 1, tokenId: 'T' });

    expect(store.listOperations().length).toBe(2);
    expect(store.listOperations()[0]!.type).toBe('withdraw');

    expect(store.deleteOperation!(op2.id)).toBe(true);
    expect(store.deleteOperation!(op1.id)).toBe(false);

    store.clearOperations!();
    expect(store.listOperations()).toEqual([]);
  });

  it('supports merkle leaves APIs', async () => {
    const store = new MemoryStore();
    store.init({ walletId: 'wallet_merkle' });

    await store.appendMerkleLeaves?.(1, [
      { cid: 0, commitment: '0x01' as any },
      { cid: 1, commitment: '0x02' as any },
    ]);
    await expect(store.getMerkleLeaves?.(1)).resolves.toEqual([
      { cid: 0, commitment: '0x01' },
      { cid: 1, commitment: '0x02' },
    ]);

    await store.clearMerkleLeaves?.(1);
    await expect(store.getMerkleLeaves?.(1)).resolves.toBeUndefined();
  });
});
