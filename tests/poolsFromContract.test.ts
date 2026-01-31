import { describe, expect, it } from 'vitest';
import { fetchPoolTokensFromContract } from '../src/ledger/poolsFromContract';

describe('fetchPoolTokensFromContract', () => {
  it('fetches poolIds + pool infos and returns TokenMetadata', async () => {
    const multicall = async ({ contracts }: any) => {
      const first = contracts[0]?.functionName;
      if (first === 'poolIds') {
        return [
          { status: 'success', result: 111n },
          { status: 'success', result: 222n },
          { status: 'success', result: 0n },
        ];
      }
      if (first === 'getPoolInfo') {
        return [
          {
            status: 'success',
            result: {
              token: '0x00000000000000000000000000000000000000aa',
              depositFeeBPS: 25n,
              withdrawFeeBPS: 50n,
              accumulatedFee: 0n,
              viewerPK: [1n, 2n],
              freezerPK: [3n, 4n],
              transferMaxAmount: 1000n,
              withdrawMaxAmount: 2000n,
            },
          },
          {
            status: 'success',
            result: {
              token: '0x00000000000000000000000000000000000000bb',
              depositFeeBPS: 0n,
              withdrawFeeBPS: 0n,
              accumulatedFee: 0n,
              viewerPK: [5n, 6n],
              freezerPK: [7n, 8n],
              transferMaxAmount: 0n,
              withdrawMaxAmount: 0n,
            },
          },
        ];
      }
      if (first === 'symbol') {
        return [
          { status: 'success', result: 'AA' },
          { status: 'success', result: 18 },
          { status: 'success', result: 'BB' },
          { status: 'success', result: 6 },
        ];
      }
      throw new Error('unexpected multicall');
    };

    const tokens = await fetchPoolTokensFromContract({
      publicClient: { multicall } as any,
      chainId: 1,
      contractAddress: '0x00000000000000000000000000000000000000cc',
      maxPools: 3,
      includeErc20Metadata: true,
    });

    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({
      id: '111',
      symbol: 'AA',
      decimals: 18,
      wrappedErc20: '0x00000000000000000000000000000000000000aa',
      depositFeeBps: 25,
      withdrawFeeBps: 50,
      transferMaxAmount: 1000n,
      withdrawMaxAmount: 2000n,
    });
    expect(tokens[1]).toMatchObject({
      id: '222',
      symbol: 'BB',
      decimals: 6,
      wrappedErc20: '0x00000000000000000000000000000000000000bb',
    });
  });
});

