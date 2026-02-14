import type { Address, PublicClient } from 'viem';
import { App_ABI } from '../abi/app';
import { SdkError } from '../errors';
import { toBigintOrThrow } from '../utils/bigint';

/**
 * Convert bigint-like values to decimal string without throwing.
 */
const tryToDecString = (value: string | bigint) => {
  try {
    return BigInt(value).toString();
  } catch {
    return String(value);
  }
};

/**
 * Find the on-chain merkle root index that matches the remote proof root.
 * Searches a bounded window around the current index to tolerate lag.
 */
export async function pickMerkleRootIndex(input: {
  chainId?: number;
  publicClient: PublicClient;
  contractAddress: Address;
  currentIndex: number;
  remoteMerkleRoot: string | bigint;
  onDebug?: (event: { message: string; detail?: Record<string, unknown> }) => void;
  /**
   * Search window around `currentIndex` (inclusive).
   * Defaults to a small window to tolerate off-by-some roots caused by lagging remote proof services.
   */
  search?: { back?: number; forward?: number };
}): Promise<number> {
  const remoteRootDec = tryToDecString(input.remoteMerkleRoot);
  const back = Math.max(0, Math.floor(input.search?.back ?? 2));
  const forward = Math.max(0, Math.floor(input.search?.forward ?? 8));

  const indices: number[] = [];
  for (let i = input.currentIndex; i <= input.currentIndex + forward; i++) indices.push(i);
  for (let i = input.currentIndex - 1; i >= input.currentIndex - back; i--) indices.push(i);

  for (const idx of indices) {
    if (idx < 0) continue;
    let root: unknown;
    try {
      input.onDebug?.({ message: 'readContract merkleRoots', detail: { triedIndex: idx } });
      root = await input.publicClient.readContract({
        address: input.contractAddress,
        abi: App_ABI,
        functionName: 'merkleRoots',
        args: [BigInt(idx)],
      });
    } catch (error) {
      throw new SdkError('MERKLE', 'Failed to read on-chain merkleRoots', { chainId: input.chainId, contractAddress: input.contractAddress, currentIndex: input.currentIndex, triedIndex: idx }, error);
    }

    const rootDec = toBigintOrThrow(root, {
      code: 'MERKLE',
      name: 'on-chain merkle root',
      detail: { chainId: input.chainId, contractAddress: input.contractAddress, currentIndex: input.currentIndex, triedIndex: idx },
    }).toString();

    if (rootDec === remoteRootDec) return idx;
  }

  throw new SdkError('MERKLE', 'Remote merkle root not found on-chain', {
    chainId: input.chainId,
    contractAddress: input.contractAddress,
    currentIndex: input.currentIndex,
    remoteMerkleRoot: remoteRootDec,
    tried: indices.filter((i) => i >= 0),
  });
}
