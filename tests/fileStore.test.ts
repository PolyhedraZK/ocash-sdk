import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../src/store/fileStore';

describe('FileStore', () => {
  it('persists wallet state and operations across instances', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ocash-sdk-filestore-'));
    try {
      const store1 = new FileStore({ baseDir: dir });
      await store1.init({ walletId: 'wallet_1' });

      await store1.setSyncCursor(1, { memo: 1, nullifier: 2, merkle: 3 });
      await store1.upsertUtxos([
        {
          chainId: 1,
          assetId: 'T',
          amount: 123n,
          commitment: '0x01',
          nullifier: '0x02',
          mkIndex: 7,
          isFrozen: false,
          isSpent: false,
          memo: '0x03',
        },
      ]);

      const op = store1.createOperation({ type: 'transfer', chainId: 1, tokenId: 'T' });
      store1.updateOperation(op.id, { status: 'submitted', requestUrl: 'https://relayer/api/v1/transfer' });
      await store1.close();

      const store2 = new FileStore({ baseDir: dir });
      await store2.init({ walletId: 'wallet_1' });

      await expect(store2.getSyncCursor(1)).resolves.toEqual({ memo: 1, nullifier: 2, merkle: 3 });
      await expect(store2.listUtxos({ chainId: 1 })).resolves.toMatchObject([{ amount: 123n, isSpent: false }]);
      expect(store2.listOperations({ chainId: 1 })[0]).toMatchObject({
        id: op.id,
        type: 'transfer',
        status: 'submitted',
        requestUrl: 'https://relayer/api/v1/transfer',
      });
    } finally {
      await rm(await Promise.resolve(dir), { recursive: true, force: true });
    }
  });

  it('does not leak state when switching walletId with no persisted file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ocash-sdk-filestore-'));
    try {
      const store = new FileStore({ baseDir: dir });
      await store.init({ walletId: 'wallet_a' });
      await store.setSyncCursor(1, { memo: 1, nullifier: 2, merkle: 3 });
      store.createOperation({ type: 'transfer', chainId: 1, tokenId: 'T' });
      await store.close();

      await store.init({ walletId: 'wallet_b' });
      await expect(store.getSyncCursor(1)).resolves.toBeUndefined();
      await expect(store.listUtxos({ chainId: 1 })).resolves.toEqual([]);
      expect(store.listOperations()).toEqual([]);
    } finally {
      await rm(await Promise.resolve(dir), { recursive: true, force: true });
    }
  });

  it('prunes operations when maxOperations is set', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ocash-sdk-filestore-'));
    try {
      const store1 = new FileStore({ baseDir: dir, maxOperations: 2 });
      await store1.init({ walletId: 'wallet_prune' });
      store1.createOperation({ type: 'deposit', chainId: 1, tokenId: 'T' });
      store1.createOperation({ type: 'transfer', chainId: 1, tokenId: 'T' });
      store1.createOperation({ type: 'withdraw', chainId: 1, tokenId: 'T' });
      await store1.close();

      const store2 = new FileStore({ baseDir: dir, maxOperations: 2 });
      await store2.init({ walletId: 'wallet_prune' });
      const ops = store2.listOperations();
      expect(ops.length).toBe(2);
      expect(ops[0]!.type).toBe('withdraw');
    } finally {
      await rm(await Promise.resolve(dir), { recursive: true, force: true });
    }
  });
});
