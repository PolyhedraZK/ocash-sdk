import { afterEach, describe, expect, it, vi } from 'vitest';
import { MerkleClient } from '../src/merkle/merkleClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MerkleClient.getProofByCids', () => {
  it('normalizes a valid response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            proof: [{ path: ['0x01', '0x02'], leaf_index: '0' }],
            merkle_root: '0x1234',
            latest_cid: '10',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const client = new MerkleClient('https://merkle.example');
    const res = await client.getProofByCids([1, 2]);
    expect(res.latest_cid).toBe(10);
    expect(res.merkle_root).toBe('0x1234');
    expect(res.proof[0]?.path).toEqual(['0x01', '0x02']);
  });

  it('throws SdkError(MERKLE) on missing proof[]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ merkle_root: '0x1', latest_cid: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const client = new MerkleClient('https://merkle.example');
    await expect(client.getProofByCids([1])).rejects.toMatchObject({ name: 'SdkError', code: 'MERKLE' });
  });

  it('throws SdkError(MERKLE) on invalid latest_cid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            proof: [{ path: ['0x01'], leaf_index: 0 }],
            merkle_root: '0x1',
            latest_cid: 'nope',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const client = new MerkleClient('https://merkle.example');
    await expect(client.getProofByCids([1])).rejects.toMatchObject({ name: 'SdkError', code: 'MERKLE', message: 'Invalid merkle latest_cid' });
  });

  it('wraps network fetch errors into SdkError(MERKLE)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const client = new MerkleClient('https://merkle.example');
    await expect(client.getProofByCids([1])).rejects.toMatchObject({
      name: 'SdkError',
      code: 'MERKLE',
      message: 'Merkle proof request failed',
    });
  });
});
