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

    expect(keys).toEqual(['ocash:sdk:store:wallet_1', 'ocash:sdk:store:wallet_1']);
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

    const raw = db.get('ocash:sdk:store:wallet_serial');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.operations[0]).toMatchObject({ id: op.id, status: 'confirmed', txHash: '0xaaa' });
  });
});
