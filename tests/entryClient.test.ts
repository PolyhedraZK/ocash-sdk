import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntryClient } from '../src/sync/entryClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EntryClient', () => {
  it('listMemos normalizes items and total', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 0,
            data: { data: [{ commitment: '0x01', memo: '0x02', cid: 1, created_at: 123 }], total: '5' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const client = new EntryClient('https://entry.example');
    const res = await client.listMemos({ chainId: 1, address: '0xabc', offset: 0, limit: 10 });
    expect(res.total).toBe(5);
    expect(res.items[0]).toMatchObject({ commitment: '0x01', memo: '0x02', cid: 1, created_at: 123 });
  });

  it('listMemos throws SdkError(SYNC) on invalid cid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 0,
            data: { data: [{ commitment: '0x01', memo: '0x02', cid: -1 }], total: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const client = new EntryClient('https://entry.example');
    await expect(client.listMemos({ chainId: 1, address: '0xabc', offset: 0, limit: 10 })).rejects.toMatchObject({
      name: 'SdkError',
      code: 'SYNC',
      message: 'Invalid entry memo cid',
    });
  });

  it('listMemos throws SdkError(SYNC) on non-integer cid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 0,
            data: { data: [{ commitment: '0x01', memo: '0x02', cid: 1.5 }], total: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const client = new EntryClient('https://entry.example');
    await expect(client.listMemos({ chainId: 1, address: '0xabc', offset: 0, limit: 10 })).rejects.toMatchObject({
      name: 'SdkError',
      code: 'SYNC',
      message: 'Invalid entry memo cid',
    });
  });

  it('listNullifiers returns items and total and validates nullifier', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 0,
            data: { data: [{ nullifier: '0x01', created_at: null }], total: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const client = new EntryClient('https://entry.example');
    const res = await client.listNullifiers({ chainId: 1, address: '0xabc', offset: 0, limit: 10 });
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({ nullifier: '0x01' });
  });

  it('listNullifiers throws SdkError(SYNC) on invalid hex nullifier', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 0,
            data: { data: [{ nullifier: '0xzz', created_at: null }], total: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const client = new EntryClient('https://entry.example');
    await expect(client.listNullifiers({ chainId: 1, address: '0xabc', offset: 0, limit: 10 })).rejects.toMatchObject({
      name: 'SdkError',
      code: 'SYNC',
      message: 'Invalid entry nullifier',
    });
  });

  it('throws SdkError(SYNC) when payload.code is non-zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ code: 123, message: 'bad' }), { status: 200 })),
    );
    const client = new EntryClient('https://entry.example');
    await expect(client.listNullifiers({ chainId: 1, address: '0xabc', offset: 0, limit: 10 })).rejects.toMatchObject({
      name: 'SdkError',
      code: 'SYNC',
      message: 'bad',
    });
  });
});
