import { Poseidon2, Poseidon2Domain } from '../crypto/poseidon2';
import type { Hex, RemoteMerkleProofResponse } from '../types';
import { getZeroHash, TREE_DEPTH_DEFAULT } from './zeroHashes';

/**
 * Poseidon2 merkle hash for a left/right pair.
 */
const hashPair = (left: Hex, right: Hex): Hex => {
  return Poseidon2.hashToHex(BigInt(left), BigInt(right), Poseidon2Domain.Merkle);
};

/**
 * Simple in-memory Merkle tree for contiguous leaves.
 * Used for local proof generation in tests or local mode.
 */
export class LocalMerkleTree {
  private readonly depth: number;
  private readonly leaves: Hex[] = [];
  private readonly nodeCache = new Map<string, Hex>();

  constructor(options?: { depth?: number }) {
    this.depth = Math.max(1, Math.floor(options?.depth ?? TREE_DEPTH_DEFAULT));
  }

  /**
   * Number of leaves currently stored.
   */
  get leafCount() {
    return this.leaves.length;
  }

  /**
   * Latest cid (leaf index) available in the tree.
   */
  get latestCid(): number {
    return Math.max(0, this.leaves.length - 1);
  }

  /**
   * Current merkle root at the configured depth.
   */
  get root(): Hex {
    return this.node(this.depth, 0);
  }

  /**
   * Append contiguous leaves in order, rejecting gaps.
   */
  appendLeaves(input: Array<{ index: number; commitment: Hex }>) {
    if (!input.length) return;
    const sorted = [...input].sort((a, b) => a.index - b.index);
    let expected = this.leaves.length;
    for (const leaf of sorted) {
      if (leaf.index !== expected) {
        throw new Error(`Non-contiguous merkle leaves: expected index=${expected}, got index=${leaf.index}`);
      }
      this.leaves.push(leaf.commitment);
      expected++;
    }
    // Conservative: clear cache to avoid mixing old nodes with new leafCount-dependent nodes.
    this.nodeCache.clear();
  }

  /**
   * Build a Merkle proof response for one or more cids.
   */
  buildProofByCids(cids: number[]): RemoteMerkleProofResponse {
    if (!cids.length) {
      throw new Error('Merkle proof requires at least one cid');
    }
    const latest = this.latestCid;
    const proof = cids.map((cid) => {
      if (!Number.isInteger(cid) || cid < 0) throw new Error(`Invalid cid: ${cid}`);
      if (cid > latest) throw new Error(`cid out of range: ${cid} > latest_cid=${latest}`);
      const path: Hex[] = [];
      let pos = cid;
      path.push(this.node(0, pos));
      for (let level = 0; level < this.depth; level++) {
        const siblingPos = pos ^ 1;
        path.push(this.node(level, siblingPos));
        pos = Math.floor(pos / 2);
      }
      return { path, leaf_index: cid };
    });

    return {
      proof,
      merkle_root: this.root,
      latest_cid: latest,
    };
  }

  /**
   * Recursively compute a node at (level, position) with memoization.
   */
  private node(level: number, position: number): Hex {
    if (level < 0) throw new Error('Invalid merkle level');
    if (position < 0) throw new Error('Invalid merkle position');
    if (level === 0) {
      if (position < this.leaves.length) return this.leaves[position]!;
      return getZeroHash(0);
    }
    if (level > this.depth) throw new Error(`Merkle level out of range: ${level} > depth=${this.depth}`);
    const key = `${level}:${position}`;
    const cached = this.nodeCache.get(key);
    if (cached) return cached;
    const left = this.node(level - 1, position * 2);
    const right = this.node(level - 1, position * 2 + 1);
    const value = hashPair(left, right);
    this.nodeCache.set(key, value);
    return value;
  }
}
