import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memoryStore';

describe('StorageAdapter.listOperations query', () => {
  it('filters by chainId/type/status and supports offset', () => {
    const store = new MemoryStore();
    store.createOperation({ type: 'deposit', chainId: 1, tokenId: 'T', status: 'confirmed' });
    store.createOperation({ type: 'transfer', chainId: 1, tokenId: 'T', status: 'failed' });
    store.createOperation({ type: 'withdraw', chainId: 2, tokenId: 'T', status: 'confirmed' });
    store.createOperation({ type: 'transfer', chainId: 1, tokenId: 'U', status: 'confirmed' });

    const list = store.listOperations({ chainId: 1, type: 'transfer' });
    expect(list).toHaveLength(2);

    const confirmed = store.listOperations({ chainId: 1, status: 'confirmed', limit: 10 });
    expect(confirmed.every((op) => op.chainId === 1 && op.status === 'confirmed')).toBe(true);

    const page1 = store.listOperations({ chainId: 1, limit: 1 });
    const page2 = store.listOperations({ chainId: 1, limit: 1, offset: 1 });
    expect(page1[0]?.id).not.toBe(page2[0]?.id);
  });

  it('supports type/status arrays and asc ordering', () => {
    const store = new MemoryStore();
    const a = store.createOperation({ type: 'deposit', chainId: 1, status: 'created' });
    const b = store.createOperation({ type: 'transfer', chainId: 1, status: 'confirmed' });

    const filtered = store.listOperations({ type: ['deposit', 'transfer'], status: ['created', 'confirmed'] });
    expect(filtered).toHaveLength(2);

    const asc = store.listOperations({ sort: 'asc', limit: 10 });
    expect(asc[0]?.id).toBe(a.id);
    expect(asc[1]?.id).toBe(b.id);
  });
});
