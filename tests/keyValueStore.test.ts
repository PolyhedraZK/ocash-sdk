import { describe, expect, it } from 'vitest';
import { KeyValueStore } from '../src/store/keyValueStore';

describe('KeyValueStore', () => {
  it('keeps previous walletId when init() is called without options', async () => {
    const keys: string[] = [];
    const store = new KeyValueStore({
      client: {
        get: async (key) => {
          keys.push(key);
          return null;
        },
        set: async () => {},
      },
    });

    await store.init({ walletId: 'wallet_1' });
    await store.init();

    expect(keys).toEqual([
      'ocash:sdk:store:wallet_1:wallet:meta:cursorChains',
      'ocash:sdk:store:wallet_1:wallet:meta:utxoRefs',
      'ocash:sdk:store:wallet_1:wallet:meta:operationIds',
      'ocash:sdk:store:wallet_1:wallet:meta:cursorChains',
      'ocash:sdk:store:wallet_1:wallet:meta:utxoRefs',
      'ocash:sdk:store:wallet_1:wallet:meta:operationIds',
    ]);
  });

  it('persists wallet state and operations via KeyValueClient', async () => {
    const db = new Map<string, string>();
    const client = {
      get: async (key: string) => db.get(key) ?? null,
      set: async (key: string, value: string) => {
        db.set(key, value);
      },
    };

    const store1 = new KeyValueStore({ client });
    await store1.init({ walletId: 'wallet_2' });
    await store1.setSyncCursor(1, { memo: 9, nullifier: 8, merkle: 7 });
    const op = store1.createOperation({ type: 'withdraw', chainId: 1, tokenId: 'T' });
    store1.updateOperation(op.id, { status: 'failed', error: 'boom' });

    await store1.close();

    const store2 = new KeyValueStore({ client });
    await store2.init({ walletId: 'wallet_2' });
    await expect(store2.getSyncCursor(1)).resolves.toEqual({ memo: 9, nullifier: 8, merkle: 7 });
    expect(store2.listOperations({ status: 'failed' })[0]).toMatchObject({ id: op.id, type: 'withdraw', error: 'boom' });

    // Merkle leaves should persist too.
    await store1.init({ walletId: 'wallet_2' });
    await store1.appendMerkleLeaves?.(1, [{ cid: 0, commitment: '0x01' } as any]);
    await store1.close();
    const store3 = new KeyValueStore({ client });
    await store3.init({ walletId: 'wallet_2' });
    await expect(store3.getMerkleLeaves?.(1)).resolves.toEqual([{ cid: 0, commitment: '0x01' }]);
  });

  it('does not leak state when switching walletId with no persisted data', async () => {
    const db = new Map<string, string>();
    const client = {
      get: async (key: string) => db.get(key) ?? null,
      set: async (key: string, value: string) => {
        db.set(key, value);
      },
    };

    const store = new KeyValueStore({ client });
    await store.init({ walletId: 'wallet_a' });
    await store.setSyncCursor(1, { memo: 1, nullifier: 1, merkle: 1 });
    store.createOperation({ type: 'deposit', chainId: 1, tokenId: 'T' });
    await store.close();

    await store.init({ walletId: 'wallet_b' });
    await expect(store.getSyncCursor(1)).resolves.toBeUndefined();
    await expect(store.listUtxos({ chainId: 1 })).resolves.toEqual({ total: 0, rows: [] });
    expect(store.listOperations()).toEqual([]);
  });

  it('serializes background saves to avoid stale writes', async () => {
    const db = new Map<string, string>();
    let inflight = 0;
    let maxInflight = 0;
    const resolvers: Array<() => void> = [];

    const client = {
      get: async (key: string) => db.get(key) ?? null,
      set: async (key: string, value: string) => {
        inflight++;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise<void>((resolve) => resolvers.push(resolve));
        db.set(key, value);
        inflight--;
      },
    };

    const store = new KeyValueStore({ client });
    await store.init({ walletId: 'wallet_serial' });
    const op = store.createOperation({ type: 'deposit', chainId: 1, tokenId: 'T' });
    store.updateOperation(op.id, { status: 'confirmed', txHash: '0xaaa' });

    const closePromise = store.close();

    for (let i = 0; i < 10; i++) {
      if (resolvers.length) break;
      await Promise.resolve();
    }
    expect(maxInflight).toBe(1);
    expect(resolvers.length).toBe(1);

    for (let i = 0; i < 10; i++) {
      const next = resolvers.shift();
      if (next) next();
      await Promise.resolve();
      const done = await Promise.race([closePromise.then(() => true), Promise.resolve(false)]);
      if (done) break;
    }

    await closePromise;

    const raw = db.get(`ocash:sdk:store:wallet_serial:wallet:operation:${op.id}`);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed).toMatchObject({ id: op.id, status: 'confirmed', txHash: '0xaaa' });
  });

  it('writes wallet records incrementally instead of full-wallet blobs', async () => {
    const db = new Map<string, string>();
    const writes: string[] = [];
    const client = {
      get: async (key: string) => db.get(key) ?? null,
      set: async (key: string, value: string) => {
        writes.push(key);
        db.set(key, value);
      },
    };

    const store = new KeyValueStore({ client });
    await store.init({ walletId: 'wallet_inc' });

    writes.length = 0;
    await store.setSyncCursor(1, { memo: 1, nullifier: 2, merkle: 3 });
    expect(writes).toContain('ocash:sdk:store:wallet_inc:wallet:cursor:1');
    expect(writes).toContain('ocash:sdk:store:wallet_inc:wallet:meta:cursorChains');
    expect(writes.some((k) => k.includes(':wallet:meta:utxoRefs'))).toBe(false);
    expect(writes.some((k) => k.includes(':wallet:meta:operationIds'))).toBe(false);

    writes.length = 0;
    await store.upsertUtxos([
      {
        chainId: 1,
        assetId: 'T',
        amount: 10n,
        commitment: '0x01',
        nullifier: '0x02',
        mkIndex: 1,
        isFrozen: false,
        isSpent: false,
      },
    ] as any);
    expect(writes).toContain('ocash:sdk:store:wallet_inc:wallet:utxo:1:0x01');
    expect(writes).toContain('ocash:sdk:store:wallet_inc:wallet:meta:utxoRefs');
    expect(writes.some((k) => k.endsWith(':meta:operationIds'))).toBe(false);

    writes.length = 0;
    await store.upsertUtxos([
      {
        chainId: 1,
        assetId: 'T',
        amount: 11n,
        commitment: '0x01',
        nullifier: '0x02',
        mkIndex: 1,
        isFrozen: false,
        isSpent: false,
      },
    ] as any);
    expect(writes).toContain('ocash:sdk:store:wallet_inc:wallet:utxo:1:0x01');
    expect(writes.some((k) => k.endsWith(':meta:utxoRefs'))).toBe(false);
  });

  it('writes shared records incrementally per chain/id', async () => {
    const db = new Map<string, string>();
    const writes: string[] = [];
    const client = {
      get: async (key: string) => db.get(key) ?? null,
      set: async (key: string, value: string) => {
        writes.push(key);
        db.set(key, value);
      },
    };

    const store = new KeyValueStore({ client });
    await store.init({ walletId: 'wallet_shared_inc' });

    writes.length = 0;
    await store.upsertEntryMemos?.([{ chainId: 7, cid: 0, commitment: '0x01', memo: '0x02' } as any]);
    expect(writes).toContain('ocash:sdk:store:shared:entryMemos:7:0');
    expect(writes).toContain('ocash:sdk:store:shared:entryMemos:7:meta');

    writes.length = 0;
    await store.upsertEntryMemos?.([{ chainId: 7, cid: 0, commitment: '0x01', memo: '0x03' } as any]);
    expect(writes).toContain('ocash:sdk:store:shared:entryMemos:7:0');
    expect(writes.some((k) => k.endsWith(':shared:entryMemos:7:meta'))).toBe(false);
  });

  it('loads wallet data on demand (meta first, records later)', async () => {
    const db = new Map<string, string>();
    db.set('ocash:sdk:store:wallet_lazy:wallet:meta:utxoRefs', JSON.stringify(['1:0xabc']));
    db.set(
      'ocash:sdk:store:wallet_lazy:wallet:utxo:1:0xabc',
      JSON.stringify({
        chainId: 1,
        assetId: 'T',
        amount: '5',
        commitment: '0xabc',
        nullifier: '0xdef',
        mkIndex: 1,
        isFrozen: false,
        isSpent: false,
      }),
    );

    const gets: string[] = [];
    const client = {
      get: async (key: string) => {
        gets.push(key);
        return db.get(key) ?? null;
      },
      set: async (key: string, value: string) => {
        db.set(key, value);
      },
    };

    const store = new KeyValueStore({ client });
    await store.init({ walletId: 'wallet_lazy' });
    expect(gets).toEqual([
      'ocash:sdk:store:wallet_lazy:wallet:meta:cursorChains',
      'ocash:sdk:store:wallet_lazy:wallet:meta:utxoRefs',
      'ocash:sdk:store:wallet_lazy:wallet:meta:operationIds',
    ]);

    gets.length = 0;
    await store.listUtxos({ chainId: 1 });
    expect(gets).toContain('ocash:sdk:store:wallet_lazy:wallet:utxo:1:0xabc');
  });
});
