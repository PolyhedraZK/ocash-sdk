import { describe, expect, it } from 'vitest';
import { IndexedDbStore } from '../src/store/indexedDbStore';

type FakeDbState = Map<
  string,
  {
    keyPath: string | string[];
    data: Map<string, any>;
    indexes: Map<string, { keyPath: string | string[] }>;
  }
>;

function createFakeIndexedDb() {
  const storesByDbName = new Map<string, FakeDbState>();

  if (!(globalThis as any).IDBKeyRange) {
    (globalThis as any).IDBKeyRange = { only: (key: unknown) => ({ __only: key }) };
  }

  const normalizeKey = (key: unknown) => {
    if (Array.isArray(key)) return `a:${JSON.stringify(key)}`;
    return `s:${String(key)}`;
  };

  const getKeyFromRow = (row: any, keyPath: string | string[]) => {
    if (Array.isArray(keyPath)) return keyPath.map((k) => row?.[k]);
    return row?.[keyPath];
  };

  const ensureStore = (stores: FakeDbState, storeName: string, keyPath: string | string[]) => {
    const existing = stores.get(storeName);
    if (existing) return existing;
    const meta = { keyPath, data: new Map<string, any>(), indexes: new Map<string, { keyPath: string | string[] }>() };
    stores.set(storeName, meta);
    return meta;
  };

  const makeObjectStore = (meta: FakeDbState extends Map<string, infer T> ? T : never, tx: any) => {
    return {
      indexNames: {
        contains: (name: string) => meta.indexes.has(name),
      },
      createIndex: (name: string, keyPath: string | string[]) => {
        meta.indexes.set(name, { keyPath });
      },
      get: (id: IDBValidKey) => {
        const getReq: any = { result: undefined, error: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          getReq.result = meta.data.get(normalizeKey(id));
          getReq.onsuccess?.();
        });
        return getReq;
      },
      getAll: () => {
        const req: any = { result: undefined, error: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          req.result = Array.from(meta.data.values());
          req.onsuccess?.();
        });
        return req;
      },
      put: (row: any) => {
        const key = normalizeKey(getKeyFromRow(row, meta.keyPath));
        meta.data.set(key, row);
        queueMicrotask(() => tx.oncomplete?.());
      },
      delete: (id: IDBValidKey) => {
        meta.data.delete(normalizeKey(id));
        queueMicrotask(() => tx.oncomplete?.());
      },
      index: (name: string) => {
        const index = meta.indexes.get(name);
        if (!index) throw new Error(`index ${name} not found`);
        return {
          getAll: (key: IDBValidKey) => {
            const req: any = { result: undefined, error: null, onsuccess: null, onerror: null };
            queueMicrotask(() => {
              const wanted = normalizeKey(key);
              const rows = Array.from(meta.data.values()).filter((row) => normalizeKey(getKeyFromRow(row, index.keyPath)) === wanted);
              req.result = rows;
              req.onsuccess?.();
            });
            return req;
          },
          openCursor: (range: any) => {
            const req: any = { result: undefined, error: null, onsuccess: null, onerror: null };
            const key = range && typeof range === 'object' && '__only' in range ? range.__only : range;
            const wanted = normalizeKey(key);
            const entries = Array.from(meta.data.entries())
              .filter(([, row]) => normalizeKey(getKeyFromRow(row, index.keyPath)) === wanted)
              .map(([primaryKey, row]) => ({ primaryKey, row }));
            let idx = 0;
            const next = () => {
              if (idx >= entries.length) {
                req.result = null;
                req.onsuccess?.();
                return;
              }
              const entry = entries[idx]!;
              req.result = {
                value: entry.row,
                delete: () => meta.data.delete(entry.primaryKey),
                continue: () => {
                  idx += 1;
                  queueMicrotask(next);
                },
              };
              req.onsuccess?.();
            };
            queueMicrotask(next);
            return req;
          },
        };
      },
    };
  };

  const open = (name: string) => {
    const req: any = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => {
      try {
        const stores = storesByDbName.get(name) ?? new Map<string, { keyPath: string | string[]; data: Map<string, any>; indexes: Map<string, { keyPath: string | string[] }> }>();
        storesByDbName.set(name, stores);

        const db: any = {
          objectStoreNames: {
            contains: (storeName: string) => stores.has(storeName),
          },
          createObjectStore: (storeName: string, options?: { keyPath?: string | string[] }) => {
            const keyPath = options?.keyPath ?? 'id';
            const meta = ensureStore(stores, storeName, keyPath);
            return makeObjectStore(meta as any, req.transaction);
          },
          transaction: (storeName: string, _mode: 'readonly' | 'readwrite') => {
            const tx: any = { oncomplete: null, onerror: null, error: null };
            const meta = ensureStore(stores, storeName, 'id');
            tx.objectStore = () => makeObjectStore(meta as any, tx);
            return tx;
          },
          close: () => {},
        };

        req.result = db;
        req.transaction = {
          objectStore: (storeName: string) => {
            const meta = ensureStore(stores, storeName, 'id');
            return makeObjectStore(meta as any, req.transaction);
          },
        };
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
      return storesByDbName.get(dbName)?.get(storeName)?.data;
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
    store1.createOperation({ type: 'deposit', chainId: 1, tokenId: 'T', createdAt: 1 });
    store1.createOperation({ type: 'transfer', chainId: 1, tokenId: 'T', createdAt: 2 });
    store1.createOperation({ type: 'withdraw', chainId: 1, tokenId: 'T', createdAt: 3 });
    await store1.close();

    const store2 = new IndexedDbStore({ dbName: 'db_prune', storeName: 's1', indexedDb, maxOperations: 2 });
    await store2.init({ walletId: 'wallet_1' });
    const ops = store2.listOperations();
    expect(ops.length).toBe(2);
    expect(ops[0]!.type).toBe('withdraw');
  });

  it('supports persisted merkle leaves', async () => {
    const indexedDb = createFakeIndexedDb();

    const store1 = new IndexedDbStore({ dbName: 'db_merkle_ops', storeName: 's1', indexedDb });
    await store1.init({ walletId: 'wallet_1' });
    await store1.appendMerkleLeaves?.(1, [
      { cid: 0, commitment: '0x01' as any },
      { cid: 1, commitment: '0x02' as any },
    ]);
    await store1.close();

    const store2 = new IndexedDbStore({ dbName: 'db_merkle_ops', storeName: 's1', indexedDb });
    await store2.init({ walletId: 'wallet_1' });
    await expect(store2.getMerkleLeaves?.(1)).resolves.toEqual([
      { cid: 0, commitment: '0x01' },
      { cid: 1, commitment: '0x02' },
    ]);
  });
});
