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

  // Regression: server uses serde_qs which expects `cid[N]=...`,
  // not repeated bare `cid=...&cid=...`. The latter produces a 400
  // "Multiple values for one key: cid". Verify the URL we send.
  it('builds query in rails-style bracket notation, not repeated bare keys', async () => {
    let capturedUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        capturedUrl = url;
        return new Response(
          JSON.stringify({
            proof: [
              { path: [], leaf_index: '0' },
              { path: [], leaf_index: '1' },
              { path: [], leaf_index: '2' },
            ],
            merkle_root: '0x1',
            latest_cid: 0,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const client = new MerkleClient('https://merkle.example');
    await client.getProofByCids([6067, 5055, 7792]);
    expect(capturedUrl).toContain('cid%5B0%5D=6067');
    expect(capturedUrl).toContain('cid%5B1%5D=5055');
    expect(capturedUrl).toContain('cid%5B2%5D=7792');
    expect(capturedUrl).not.toMatch(/[?&]cid=\d+&cid=\d+/);
  });
});
