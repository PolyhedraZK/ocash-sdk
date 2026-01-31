import { describe, expect, it } from 'vitest';
import { pickMerkleRootIndex } from '../src/ops/pickMerkleRootIndex';

describe('pickMerkleRootIndex', () => {
  it('finds remote root within the forward window', async () => {
    const roots = new Map<number, bigint>([
      [10, 100n],
      [11, 101n],
      [12, 102n],
      [13, 103n],
    ]);
    const publicClient: any = {
      readContract: async ({ args }: any) => {
        const idx = Number(args[0]);
        return roots.get(idx);
      },
    };

    await expect(
      pickMerkleRootIndex({
        publicClient,
        contractAddress: '0x0000000000000000000000000000000000000000',
        currentIndex: 10,
        remoteMerkleRoot: 103n,
        search: { forward: 8, back: 0 },
      } as any),
    ).resolves.toBe(13);
  });

  it('finds remote root within the back window', async () => {
    const roots = new Map<number, bigint>([
      [8, 88n],
      [9, 89n],
      [10, 90n],
    ]);
    const publicClient: any = {
      readContract: async ({ args }: any) => {
        const idx = Number(args[0]);
        return roots.get(idx);
      },
    };

    await expect(
      pickMerkleRootIndex({
        publicClient,
        contractAddress: '0x0000000000000000000000000000000000000000',
        currentIndex: 10,
        remoteMerkleRoot: '89',
        search: { forward: 0, back: 5 },
      } as any),
    ).resolves.toBe(9);
  });

  it('throws when not found', async () => {
    const publicClient: any = { readContract: async () => 1n };

    await expect(
      pickMerkleRootIndex({
        publicClient,
        contractAddress: '0x0000000000000000000000000000000000000000',
        currentIndex: 0,
        remoteMerkleRoot: 2n,
        search: { forward: 2, back: 0 },
      } as any),
    ).rejects.toMatchObject({ name: 'SdkError', code: 'MERKLE', message: 'Remote merkle root not found on-chain' });
  });
});

