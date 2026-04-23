import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileStore } from '../src/store/fileStore';
import type { Hex } from '../src/types';

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
      await expect(store2.listUtxos({ chainId: 1 })).resolves.toMatchObject({ total: 1, rows: [{ amount: 123n, isSpent: false }] });
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
      await expect(store.listUtxos({ chainId: 1 })).resolves.toEqual({ total: 0, rows: [] });
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

  it('separates wallet writes from shared writes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ocash-sdk-filestore-'));
    try {
      const store = new FileStore({ baseDir: dir });
      await store.init({ walletId: 'wallet_sep' });

      // Trigger a shared-scope write via upsertEntryMemos
      await store.upsertEntryMemos?.([{ chainId: 1, cid: 0, commitment: '0xaa', memo: '0xbb' }]);
      const sharedPath = path.join(dir, 'shared.store.json');
      const walletPath = path.join(dir, 'wallet_sep.store.json');
      const sharedBeforeWalletWrite = await readFile(sharedPath, 'utf8');

      // Wallet-scope write should not touch shared file
      await store.setSyncCursor(1, { memo: 11, nullifier: 12, merkle: 13 });
      const sharedAfterWalletWrite = await readFile(sharedPath, 'utf8');
      expect(sharedAfterWalletWrite).toBe(sharedBeforeWalletWrite);

      // Shared-scope write should not touch wallet file
      const walletBeforeSharedWrite = await readFile(walletPath, 'utf8');
      await store.upsertEntryMemos?.([{ chainId: 1, cid: 1, commitment: '0xcc', memo: '0xdd' }]);
      const walletAfterSharedWrite = await readFile(walletPath, 'utf8');
      expect(walletAfterSharedWrite).toBe(walletBeforeSharedWrite);
    } finally {
      await rm(await Promise.resolve(dir), { recursive: true, force: true });
    }
  });

  // Regression: getMerkleLeaf used cid as positional index on the jsonl
  // without verifying row.cid matches. Ask for cid=N, get row[N], return
  // it even if row.cid !== N.
  it('getMerkleLeaf rejects slot/cid mismatch', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ocash-sdk-filestore-'));
    try {
      const store = new FileStore({ baseDir: dir });
      await store.init({ walletId: 'wallet_leaf' });
      await store.appendMerkleLeaves?.(1, [
        { cid: 0, commitment: '0xaa' as Hex },
        { cid: 1, commitment: '0xbb' as Hex },
      ]);
      await expect(store.getMerkleLeaf?.(1, 0)).resolves.toEqual({
        chainId: 1,
        cid: 0,
        commitment: '0xaa',
      });
      // Inject a gap-filled jsonl by hand. Slot 2 claims cid=99.
      const jsonlPath = path.join(dir, 'shared.merkle.1.jsonl');
      const original = await readFile(jsonlPath, 'utf8');
      await writeFile(jsonlPath, original + JSON.stringify({ cid: 99, commitment: '0xcc' }) + '\n');
      // Force reload so the in-memory cache re-reads the file.
      await store.close();
      const reopened = new FileStore({ baseDir: dir });
      await reopened.init({ walletId: 'wallet_leaf' });
      // Before the fix: returned {cid:99,commitment:0xcc}.
      await expect(reopened.getMerkleLeaf?.(1, 2)).resolves.toBeUndefined();
      await expect(reopened.getMerkleLeaf?.(1, 99)).resolves.toBeUndefined();
    } finally {
      await rm(await Promise.resolve(dir), { recursive: true, force: true });
    }
  });

  // Regression: getMerkleNextCid swallowed any error as "fresh start" and
  // reset the cached next cid to 0. A permission/parse error would then
  // cause the next append to overwrite from 0 instead of failing loudly.
  it('getMerkleNextCid does not reset on non-ENOENT errors', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ocash-sdk-filestore-'));
    try {
      const store = new FileStore({ baseDir: dir });
      await store.init({ walletId: 'wallet_nextcid' });
      await store.appendMerkleLeaves?.(1, [{ cid: 0, commitment: '0xaa' as Hex }]);
      await store.close();

      // Corrupt the last line of the jsonl so JSON.parse throws.
      const jsonlPath = path.join(dir, 'shared.merkle.1.jsonl');
      await writeFile(jsonlPath, '{"cid":0,"commitment":"0xaa"}\nnot json\n');

      const reopened = new FileStore({ baseDir: dir });
      await reopened.init({ walletId: 'wallet_nextcid' });
      // Before the fix: appendMerkleLeaves with cid:0 silently succeeded,
      // corrupting state. Now the corrupted file should either propagate
      // the parse error or refuse the append (rejecting cid=0 as
      // non-contiguous because it read the good line's cid first). Either
      // outcome is acceptable — silence is not.
      await expect(
        reopened.appendMerkleLeaves?.(1, [{ cid: 0, commitment: '0xbb' as Hex }]),
      ).rejects.toThrow();
    } finally {
      await rm(await Promise.resolve(dir), { recursive: true, force: true });
    }
  });
});
