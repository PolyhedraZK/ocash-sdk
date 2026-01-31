import { describe, expect, it } from 'vitest';

import { MemoryStore } from '../src/store/memoryStore';
import { KeyValueStore } from '../src/store/keyValueStore';
import { IndexedDbStore } from '../src/store/indexedDbStore';
import type { Hex } from '../src/types';

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

  return { open } as any as IDBFactory;
}

describe('Store Merkle leaves persistence', () => {
  it('MemoryStore supports append/get/clear merkle leaves', async () => {
    const store = new MemoryStore();
    store.init({ walletId: 'w1' });

    await expect(store.getMerkleLeaves?.(1)).resolves.toBeUndefined();
    await store.appendMerkleLeaves?.(1, [
      { cid: 0, commitment: '0x01' as Hex },
      { cid: 1, commitment: '0x02' as Hex },
    ]);
    await expect(store.getMerkleLeaves?.(1)).resolves.toEqual([
      { cid: 0, commitment: '0x01' },
      { cid: 1, commitment: '0x02' },
    ]);

    await store.clearMerkleLeaves?.(1);
    await expect(store.getMerkleLeaves?.(1)).resolves.toBeUndefined();
  });

  it('KeyValueStore persists merkle leaves across instances', async () => {
    const db = new Map<string, string>();
    const client = {
      get: async (key: string) => db.get(key) ?? null,
      set: async (key: string, value: string) => {
        db.set(key, value);
      },
    };

    const store1 = new KeyValueStore({ client });
    await store1.init({ walletId: 'w2' });
    await store1.appendMerkleLeaves?.(7, [
      { cid: 0, commitment: '0x01' as Hex },
      { cid: 1, commitment: '0x02' as Hex },
    ]);
    await store1.close();

    const store2 = new KeyValueStore({ client });
    await store2.init({ walletId: 'w2' });
    await expect(store2.getMerkleLeaves?.(7)).resolves.toEqual([
      { cid: 0, commitment: '0x01' },
      { cid: 1, commitment: '0x02' },
    ]);
  });

  it('IndexedDbStore persists merkle leaves across instances', async () => {
    const indexedDb = createFakeIndexedDb();
    const store1 = new IndexedDbStore({ dbName: 'db_merkle', storeName: 's1', indexedDb });
    await store1.init({ walletId: 'w3' });
    await store1.appendMerkleLeaves?.(1, [
      { cid: 0, commitment: '0x01' as Hex },
      { cid: 1, commitment: '0x02' as Hex },
    ]);
    await store1.close();

    const store2 = new IndexedDbStore({ dbName: 'db_merkle', storeName: 's1', indexedDb });
    await store2.init({ walletId: 'w3' });
    await expect(store2.getMerkleLeaves?.(1)).resolves.toEqual([
      { cid: 0, commitment: '0x01' },
      { cid: 1, commitment: '0x02' },
    ]);
  });
});
