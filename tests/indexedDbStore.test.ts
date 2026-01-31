import { describe, expect, it } from 'vitest';
import { IndexedDbStore } from '../src/store/indexedDbStore';

type FakeDbState = Map<string, Map<string, any>>;

function createFakeIndexedDb() {
  const storesByDbName = new Map<string, FakeDbState>();

  const open = (name: string) => {
    const req: any = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => {
      try {
        const stores = storesByDbName.get(name) ?? new Map<string, Map<string, any>>();
        storesByDbName.set(name, stores);

        const db: any = {
          objectStoreNames: {
            contains: (storeName: string) => stores.has(storeName),
          },
          createObjectStore: (storeName: string) => {
            if (!stores.has(storeName)) stores.set(storeName, new Map());
          },
          transaction: (storeName: string, _mode: 'readonly' | 'readwrite') => {
            const tx: any = { oncomplete: null, onerror: null, error: null };
            const bucket = stores.get(storeName) ?? new Map();
            stores.set(storeName, bucket);

            tx.objectStore = () => {
              return {
                get: (id: string) => {
                  const getReq: any = { result: undefined, error: null, onsuccess: null, onerror: null };
                  queueMicrotask(() => {
                    getReq.result = bucket.get(id);
                    getReq.onsuccess?.();
                  });
                  return getReq;
                },
                put: (row: any) => {
                  const id = row.id;
                  bucket.set(id, row);
                  queueMicrotask(() => tx.oncomplete?.());
                },
              };
            };
            return tx;
          },
          close: () => {},
        };

        req.result = db;
        req.onupgradeneeded?.();
        req.onsuccess?.();
      } catch (e) {
        req.error = e;
        req.onerror?.();
      }
    });

    return req;
  };

  const factory: any = { open };
  factory.__debug = {
    getBucket(dbName: string, storeName: string) {
      return storesByDbName.get(dbName)?.get(storeName);
    },
  };
  return factory as IDBFactory;
}

describe('IndexedDbStore', () => {
  it('persists wallet state and operations across instances', async () => {
    const indexedDb = createFakeIndexedDb();

    const store1 = new IndexedDbStore({ dbName: 'db1', storeName: 's1', indexedDb });
    await store1.init({ walletId: 'wallet_1' });
    await store1.setSyncCursor(1, { memo: 1, nullifier: 1, merkle: 1 });
    const op = store1.createOperation({ type: 'deposit', chainId: 1, tokenId: 'T' });
    store1.updateOperation(op.id, { status: 'confirmed', txHash: '0xaaa' });
    await store1.close();

    const store2 = new IndexedDbStore({ dbName: 'db1', storeName: 's1', indexedDb });
    await store2.init({ walletId: 'wallet_1' });
    await expect(store2.getSyncCursor(1)).resolves.toEqual({ memo: 1, nullifier: 1, merkle: 1 });
    expect(store2.listOperations({ status: 'confirmed' })[0]).toMatchObject({ id: op.id, txHash: '0xaaa' });
  });

  it('prunes operations when maxOperations is set', async () => {
    const indexedDb = createFakeIndexedDb();

    const store1 = new IndexedDbStore({ dbName: 'db_prune', storeName: 's1', indexedDb, maxOperations: 2 });
    await store1.init({ walletId: 'wallet_1' });
    store1.createOperation({ type: 'deposit', chainId: 1, tokenId: 'T' });
    store1.createOperation({ type: 'transfer', chainId: 1, tokenId: 'T' });
    store1.createOperation({ type: 'withdraw', chainId: 1, tokenId: 'T' });
    await store1.close();

    const store2 = new IndexedDbStore({ dbName: 'db_prune', storeName: 's1', indexedDb, maxOperations: 2 });
    await store2.init({ walletId: 'wallet_1' });
    const ops = store2.listOperations();
    expect(ops.length).toBe(2);
    expect(ops[0]!.type).toBe('withdraw');
  });

  it('ignores corrupted rows (ops/utxos) without throwing', async () => {
    const indexedDb: any = createFakeIndexedDb();

    const store1 = new IndexedDbStore({ dbName: 'db_corrupt', storeName: 's1', indexedDb });
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
      },
    ]);
    await store1.close();

    const bucket = indexedDb.__debug.getBucket('db_corrupt', 's1');
    expect(bucket).toBeTruthy();
    const row = bucket.get('wallet_1');
    row.json.operations = { nope: true };
    row.json.wallet.utxos['1:0x01'].amount = 'not-a-bigint';
    row.json.merkleLeaves = { '1': [{ cid: 'not-a-number', commitment: 123 }] };

    const store2 = new IndexedDbStore({ dbName: 'db_corrupt', storeName: 's1', indexedDb });
    await expect(store2.init({ walletId: 'wallet_1' })).resolves.toBeUndefined();
    await expect(store2.getSyncCursor(1)).resolves.toEqual({ memo: 1, nullifier: 2, merkle: 3 });
    expect(store2.listOperations()).toEqual([]);
    await expect(store2.listUtxos({ chainId: 1 })).resolves.toEqual([]);

    // Merkle leaves API should not throw on corrupted entries; should return undefined/empty.
    await expect(store2.getMerkleLeaves?.(1)).resolves.toBeUndefined();
  });
});
