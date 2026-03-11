import type { MerkleApi, ProofBridge, RemoteMerkleProofResponse, Hex, AccMemberWitness, InputSecret, ChairmanMerkleNodeRecord, ChairmanMerkleVersionRecord, StorageAdapter, UserKeyPair } from '../types';
import { SdkError } from '../errors';
import { MerkleClient } from './merkleClient';
import { getZeroHash, TREE_DEPTH_DEFAULT } from './zeroHashes';
import { Poseidon2, Poseidon2Domain } from '../crypto/poseidon2';
import { MemoKit } from '../memo/memoKit';
import { KeyManager } from '../crypto/keyManager';

const TEMP_ARRAY_SIZE_DEFAULT = 32;
const SUBTREE_SIZE = 32;
const SUBTREE_DEPTH = 5;

/**
 * Convert bigint-like values to decimal string without throwing.
 */
const toDecString = (value: string | bigint) => {
  try {
    return typeof value === 'bigint' ? value.toString() : BigInt(value).toString();
  } catch {
    return String(value);
  }
};

/**
 * Merkle engine supports remote, local, and hybrid proof generation.
 *
 * Local mode uses a **chairmanMerkle tree** (persistent segment tree) so that every
 * batch-merge produces a new root while sharing unchanged subtrees.
 * Rollback to any previous version is O(1) — just switch the root pointer.
 */
export class MerkleEngine implements MerkleApi {
  private readonly mode: 'remote' | 'local' | 'hybrid';
  private readonly treeDepth: number;
  private readonly pendingLeavesByChain = new Map<number, Hex[]>();
  private readonly chainStateByChain = new Map<number, { mergedElements: number; root: Hex }>();
  private readonly hydratedChains = new Set<number>();
  private readonly hydrateInFlight = new Map<number, Promise<void>>();
  /**
   * Optional callback to read `merkleRoots(rootIndex)` from the on-chain contract.
   * Returns the root hash, or null if the contract hasn't committed this index yet.
   * When provided, each batch merge is verified against the contract root.
   */
  private readonly readContractRoot?: (chainId: number, rootIndex: number) => Promise<Hex | null>;

  constructor(
    private readonly getChain: (chainId: number) => { merkleProofUrl?: string },
    private readonly bridge: ProofBridge,
    options?: { mode?: 'remote' | 'local' | 'hybrid'; treeDepth?: number; readContractRoot?: (chainId: number, rootIndex: number) => Promise<Hex | null> },
    private readonly storage?: StorageAdapter,
  ) {
    this.mode = options?.mode ?? 'hybrid';
    this.treeDepth = Math.max(1, Math.floor(options?.treeDepth ?? TREE_DEPTH_DEFAULT));
    this.readContractRoot = options?.readContractRoot;
  }

  /**
   * Compute the current merkle root index from total elements.
   */
  currentMerkleRootIndex(totalElements: number, tempArraySize: number = TEMP_ARRAY_SIZE_DEFAULT) {
    if (totalElements <= tempArraySize) return 0;
    return Math.floor((totalElements - 1) / tempArraySize);
  }

  private ensurePendingLeaves(chainId: number) {
    let pending = this.pendingLeavesByChain.get(chainId);
    if (!pending) {
      pending = [];
      this.pendingLeavesByChain.set(chainId, pending);
    }
    return pending;
  }

  private ensureChainState(chainId: number) {
    let state = this.chainStateByChain.get(chainId);
    if (!state) {
      state = { mergedElements: 0, root: getZeroHash(this.treeDepth) };
      this.chainStateByChain.set(chainId, state);
    }
    return state;
  }

  // ── Hashing ──

  private static hashPair(left: Hex, right: Hex): Hex {
    return Poseidon2.hashToHex(BigInt(left), BigInt(right), Poseidon2Domain.Merkle);
  }

  static normalizeHex32(value: unknown, name: string): Hex {
    try {
      const bi = BigInt(value as any);
      if (bi < 0n) throw new Error('negative');
      const hex = bi.toString(16).padStart(64, '0');
      if (hex.length > 64) throw new Error('too_large');
      return `0x${hex}` as Hex;
    } catch (error) {
      throw new SdkError('MERKLE', `Invalid ${name}`, { value }, error);
    }
  }

  // ── Static helpers ──

  static totalElementsInTree(totalElements: bigint, tempArraySize: number = TEMP_ARRAY_SIZE_DEFAULT): number {
    if (tempArraySize <= 0) throw new SdkError('MERKLE', 'tempArraySize must be greater than zero', { tempArraySize });
    if (totalElements <= 0n) return 0;
    const size = BigInt(tempArraySize);
    return Number(((totalElements - 1n) / size) * size);
  }

  // ── Subtree (levels 0-5, 32 leaves → 1 root) ──

  /**
   * Build a fixed-depth subtree from 32 contiguous leaves.
   * Returns the subtree root hash and all intermediate nodes for storage.
   */
  private static buildSubtree(leafCommitments: Hex[], baseIndex: number): { subtreeRoot: Hex; nodesToStore: ChairmanMerkleNodeRecord[] } {
    if (leafCommitments.length !== SUBTREE_SIZE) {
      throw new SdkError('MERKLE', 'Subtree must have exactly 32 leaf nodes', { got: leafCommitments.length });
    }
    if (baseIndex % SUBTREE_SIZE !== 0) {
      throw new SdkError('MERKLE', 'Subtree baseIndex must be aligned to 32', { baseIndex });
    }
    const nodesToStore: ChairmanMerkleNodeRecord[] = [];
    let currentLevel = [...leafCommitments];
    for (let level = 1; level <= SUBTREE_DEPTH; level++) {
      const next: Hex[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        next.push(MerkleEngine.hashPair(currentLevel[i]!, currentLevel[i + 1]!));
      }
      const basePos = baseIndex >> level;
      for (let i = 0; i < next.length; i++) {
        const position = basePos + i;
        nodesToStore.push({
          chainId: 0,
          id: `st-${level}-${position}`,
          hash: next[i]!,
          leftId: null,
          rightId: null,
        });
      }
      currentLevel = next;
    }
    return { subtreeRoot: currentLevel[0]!, nodesToStore };
  }

  // ── ChairmanMerkle tree (persistent segment tree, levels 5-32) ──

  /**
   * Insert a subtree root into the persistent main tree.
   *
   * Top-down recursive: descends from root (level treeDepth) to the target
   * leaf position (level SUBTREE_DEPTH).  At each level only the node on the
   * update path is newly created; the sibling is shared from the previous
   * version's tree.
   *
   * @returns new root node ID/hash and all newly created nodes.
   */
  private async insertSubtreeRoot(
    chainId: number,
    prevRootId: string | null,
    subtreeRootHash: Hex,
    batchIndex: number,
    version: number,
  ): Promise<{ rootId: string; rootHash: Hex; nodes: ChairmanMerkleNodeRecord[] }> {
    const MAIN_DEPTH = this.treeDepth - SUBTREE_DEPTH;
    const nodes: ChairmanMerkleNodeRecord[] = [];

    const descend = async (nodeId: string | null, depth: number): Promise<{ id: string; hash: Hex }> => {
      const originalLevel = this.treeDepth - depth;

      // Leaf level of the main tree (level 5): wrap the subtree root
      if (depth === MAIN_DEPTH) {
        const newId = `cm-${version}-${originalLevel}`;
        nodes.push({ chainId, id: newId, hash: subtreeRootHash, leftId: null, rightId: null });
        return { id: newId, hash: subtreeRootHash };
      }

      // Load previous version's children
      let prevLeftId: string | null = null;
      let prevRightId: string | null = null;
      if (nodeId) {
        const prevNode = await this.storage?.getChairmanMerkleNode?.(chainId, nodeId);
        if (prevNode) {
          prevLeftId = prevNode.leftId;
          prevRightId = prevNode.rightId;
        }
      }

      const childLevel = originalLevel - 1;
      const remainingDepth = MAIN_DEPTH - depth - 1;
      const goRight = ((batchIndex >> remainingDepth) & 1) === 1;

      let leftResult: { id: string | null; hash: Hex };
      let rightResult: { id: string | null; hash: Hex };

      if (goRight) {
        // Left child: shared from previous version
        const leftHash = prevLeftId
          ? (await this.storage?.getChairmanMerkleNode?.(chainId, prevLeftId))?.hash ?? getZeroHash(childLevel)
          : getZeroHash(childLevel);
        leftResult = { id: prevLeftId, hash: leftHash };
        // Right child: recurse
        const right = await descend(prevRightId, depth + 1);
        rightResult = { id: right.id, hash: right.hash };
      } else {
        // Left child: recurse
        const left = await descend(prevLeftId, depth + 1);
        leftResult = { id: left.id, hash: left.hash };
        // Right child: shared from previous version
        const rightHash = prevRightId
          ? (await this.storage?.getChairmanMerkleNode?.(chainId, prevRightId))?.hash ?? getZeroHash(childLevel)
          : getZeroHash(childLevel);
        rightResult = { id: prevRightId, hash: rightHash };
      }

      const hash = MerkleEngine.hashPair(leftResult.hash, rightResult.hash);
      const newId = `cm-${version}-${originalLevel}`;
      nodes.push({ chainId, id: newId, hash, leftId: leftResult.id, rightId: rightResult.id });
      return { id: newId, hash };
    };

    const root = await descend(prevRootId, 0);
    return { rootId: root.id, rootHash: root.hash, nodes };
  }

  // ── Hydration ──

  private async hydrateFromStorage(chainId: number) {
    if (this.mode === 'remote') return;
    if (this.hydratedChains.has(chainId)) return;
    const existing = this.hydrateInFlight.get(chainId);
    if (existing) return existing;

    const task = (async () => {
      try {
        const state = this.ensureChainState(chainId);
        const pending = this.ensurePendingLeaves(chainId);

        // Load latest chairmanMerkle tree version
        const latest = await this.storage?.getLatestChairmanMerkleVersion?.(chainId);
        if (latest) {
          state.mergedElements = latest.version;
          state.root = MerkleEngine.normalizeHex32(latest.rootHash, 'chairmanMerkleVersion.rootHash');
        }

        // Set up pending leaves (leaves beyond mergedElements that haven't formed a full batch)
        const leaves = await this.storage?.getMerkleLeaves?.(chainId);
        if (leaves && leaves.length > state.mergedElements) {
          const sorted = [...leaves]
            .sort((a, b) => a.cid - b.cid)
            .slice(state.mergedElements);
          pending.length = 0;
          pending.push(...sorted.map((l) => MerkleEngine.normalizeHex32(l.commitment, 'leaf.commitment')));
        }
      } catch (error) {
        if (this.mode === 'hybrid') return;
        throw new SdkError('MERKLE', 'Failed to hydrate local merkle from storage', { chainId }, error);
      } finally {
        this.hydratedChains.add(chainId);
        this.hydrateInFlight.delete(chainId);
      }
    })();

    this.hydrateInFlight.set(chainId, task);
    return task;
  }

  // ── Ingestion ──

  async ingestEntryMemos(chainId: number, memos: Array<{ cid: number | null; commitment: Hex | string | bigint }>) {
    if (this.mode === 'remote') return;
    await this.hydrateFromStorage(chainId);

    const state = this.ensureChainState(chainId);
    const pending = this.ensurePendingLeaves(chainId);

    const leaves = memos
      .filter((m): m is typeof m & { cid: number } => typeof m.cid === 'number' && Number.isInteger(m.cid) && m.cid >= 0)
      .map((m) => ({
        index: m.cid,
        commitment: MerkleEngine.normalizeHex32(m.commitment, 'memo.commitment'),
      }));
    if (!leaves.length) return;

    const sorted = [...leaves].sort((a, b) => a.index - b.index);
    const persistLeaves = sorted.map((l) => ({ cid: l.index, commitment: l.commitment }));
    try {
      await this.storage?.appendMerkleLeaves?.(chainId, persistLeaves);
    } catch {
      // Storage failure is non-fatal in hybrid mode
    }

    try {
      let expected = state.mergedElements + pending.length;
      for (const leaf of sorted) {
        if (leaf.index < expected) continue;
        if (leaf.index !== expected) {
          throw new Error(`Non-contiguous merkle leaves: expected index=${expected}, got index=${leaf.index}`);
        }
        pending.push(leaf.commitment);
        expected++;

        while (pending.length >= SUBTREE_SIZE) {
          const batch = pending.splice(0, SUBTREE_SIZE);
          const batchIndex = state.mergedElements / SUBTREE_SIZE;

          // Build subtree (levels 0-5)
          const subtree = MerkleEngine.buildSubtree(batch, state.mergedElements);
          const subtreeNodes: ChairmanMerkleNodeRecord[] = subtree.nodesToStore.map((n) => ({ ...n, chainId }));

          // Get previous version root
          const prevVersion = await this.storage?.getLatestChairmanMerkleVersion?.(chainId);
          const prevRootId = prevVersion?.rootId ?? null;

          // Insert subtree root into chairmanMerkle tree (levels 5-32)
          const newVersion = state.mergedElements + SUBTREE_SIZE;
          const result = await this.insertSubtreeRoot(chainId, prevRootId, subtree.subtreeRoot, batchIndex, newVersion);

          // Verify against on-chain root before persisting (fail-fast).
          // rootIndex = newVersion / 32, matching contract's _currentMerkleRootIndex.
          if (this.readContractRoot) {
            const rootIndex = newVersion / SUBTREE_SIZE;
            const onChainRoot = await this.readContractRoot(chainId, rootIndex).catch(() => null);
            if (onChainRoot !== null) {
              const onChainNorm = MerkleEngine.normalizeHex32(onChainRoot, 'onChainRoot');
              const isZero = BigInt(onChainNorm) === 0n;
              if (!isZero && onChainNorm !== result.rootHash) {
                // Mismatch: rollback to previous batch boundary (state.mergedElements).
                // Resets tree + sync cursor; next sync re-ingests from there.
                // If that position is also wrong, the next merge will detect it and step back again.
                const target = state.mergedElements; // previous batch end, not yet updated
                await this._rollback(chainId, target);
                throw new SdkError('MERKLE', 'Local merkle root mismatch with on-chain root — rolled back', {
                  chainId,
                  rootIndex,
                  localRoot: result.rootHash,
                  onChainRoot: onChainNorm,
                  version: newVersion,
                  rollbackTarget: target,
                });
              }
            }
          }

          // Persist all nodes + new version
          await this.storage?.putChairmanMerkleNodes?.(chainId, [...subtreeNodes, ...result.nodes]);
          await this.storage?.putChairmanMerkleVersion?.(chainId, {
            chainId,
            version: newVersion,
            rootId: result.rootId,
            rootHash: result.rootHash,
          });

          state.mergedElements = newVersion;
          state.root = result.rootHash;
        }
      }
      this.hydratedChains.add(chainId);
    } catch (error) {
      if (this.mode === 'hybrid' && error instanceof Error && /Non-contiguous merkle leaves/i.test(error.message)) {
        return;
      }
      throw new SdkError('MERKLE', 'Failed to ingest local merkle leaves', { chainId, leafCount: leaves.length }, error);
    }
  }

  // ── Rollback (tree O(1) + sync cursor reset) ──

  /**
   * Public rollback: step back one batch (32 elements) from the current position.
   * Upper-layer code calls this on any error to reset and retry.
   *
   * What gets rolled back:
   * - ChairmanMerkle tree version pointer (O(1) — old nodes still in storage)
   * - Pending leaves buffer (cleared)
   * - Sync cursor: memo + merkle fields (nullifier left unchanged — independent)
   *
   * @returns true if rollback succeeded, false if already at 0 or target version doesn't exist.
   */
  async rollback(chainId: number): Promise<boolean> {
    const state = this.ensureChainState(chainId);
    const target = Math.max(0, state.mergedElements - SUBTREE_SIZE);
    return this._rollback(chainId, target);
  }

  /**
   * Internal rollback to an exact batch boundary.
   *
   * @param targetMergedElements Must be a non-negative multiple of 32.
   *   Pass 0 to reset to the empty tree.
   * @returns true if rollback succeeded, false if the target version doesn't exist.
   */
  private async _rollback(chainId: number, targetMergedElements: number): Promise<boolean> {
    if (targetMergedElements < 0 || targetMergedElements % SUBTREE_SIZE !== 0) {
      throw new SdkError('MERKLE', '_rollback target must be a non-negative multiple of 32', { targetMergedElements });
    }

    const state = this.ensureChainState(chainId);
    const pending = this.ensurePendingLeaves(chainId);

    if (targetMergedElements === 0) {
      state.mergedElements = 0;
      state.root = getZeroHash(this.treeDepth);
      pending.length = 0;
      await this.resetSyncCursor(chainId, 0);
      return true;
    }

    const version = await this.storage?.getChairmanMerkleVersion?.(chainId, targetMergedElements);
    if (!version) return false;

    state.mergedElements = targetMergedElements;
    state.root = MerkleEngine.normalizeHex32(version.rootHash, 'version.rootHash');
    pending.length = 0;
    this.hydratedChains.add(chainId);
    await this.resetSyncCursor(chainId, targetMergedElements);
    return true;
  }

  /**
   * Reset the sync cursor's memo field to `targetMemo` (and derive merkle cursor),
   * but only if the current cursor is ahead of the target.
   * Nullifier cursor is left unchanged — nullifiers are independent of tree state.
   */
  private async resetSyncCursor(chainId: number, targetMemo: number): Promise<void> {
    if (!this.storage?.getSyncCursor || !this.storage?.setSyncCursor) return;
    const cursor = await this.storage.getSyncCursor(chainId);
    if (!cursor || cursor.memo <= targetMemo) return;
    cursor.memo = targetMemo;
    cursor.merkle = this.currentMerkleRootIndex(targetMemo);
    await this.storage.setSyncCursor(chainId, cursor);
  }

  // ── Proof generation ──

  async getProofByCid(input: { chainId: number; cid: number; totalElements: bigint }): Promise<RemoteMerkleProofResponse> {
    return this.getProofByCids({ chainId: input.chainId, cids: [input.cid], totalElements: input.totalElements });
  }

  async getProofByCids(input: { chainId: number; cids: number[]; totalElements: bigint }): Promise<RemoteMerkleProofResponse> {
    const cids = [...input.cids];
    if (cids.length === 0) throw new SdkError('MERKLE', 'No cids provided', { chainId: input.chainId });
    for (const cid of cids) {
      if (!Number.isInteger(cid) || cid < 0) {
        throw new SdkError('MERKLE', 'Invalid cid', { chainId: input.chainId, cid });
      }
    }

    const totalElements = typeof input.totalElements === 'bigint' ? input.totalElements : BigInt(input.totalElements);
    const contractTreeElements = MerkleEngine.totalElementsInTree(totalElements);
    const needsTreeProof = cids.filter((cid) => cid < contractTreeElements);

    await this.hydrateFromStorage(input.chainId);

    const canUseLocal = this.mode !== 'remote';
    if (canUseLocal) {
      // Find the version matching contractTreeElements
      const version = contractTreeElements > 0
        ? await this.storage?.getChairmanMerkleVersion?.(input.chainId, contractTreeElements)
        : undefined;
      const hasDb = typeof this.storage?.getMerkleLeaf === 'function'
        && typeof this.storage?.getChairmanMerkleNode === 'function'
        && (contractTreeElements === 0 || !!version);

      if (hasDb) {
        const state = this.ensureChainState(input.chainId);
        if (contractTreeElements > 0 && state.mergedElements < contractTreeElements) {
          if (this.mode === 'local') {
            throw new SdkError('MERKLE', 'Local merkle db is behind contract', {
              chainId: input.chainId, cids, localMergedElements: state.mergedElements, contractTreeElements,
            });
          }
          // hybrid fallback
        } else {
          try {
            const proof = [];
            for (const cid of cids) {
              if (cid >= contractTreeElements) {
                proof.push({ leaf_index: cid, path: new Array(this.treeDepth + 1).fill('0') });
                continue;
              }
              const path = await this.buildLocalProofPath(input.chainId, cid, version!);
              proof.push({ leaf_index: cid, path });
            }

            const effectiveRoot = contractTreeElements > 0
              ? MerkleEngine.normalizeHex32(version!.rootHash, 'version.rootHash')
              : getZeroHash(this.treeDepth);

            return {
              proof,
              merkle_root: effectiveRoot,
              latest_cid: totalElements > 0n ? Number(totalElements - 1n) : -1,
            };
          } catch (error) {
            if (this.mode === 'local') {
              throw new SdkError('MERKLE', 'Local merkle proof build failed', { chainId: input.chainId, cids }, error);
            }
            // hybrid fallback
          }
        }
      } else if (this.mode === 'local' && needsTreeProof.length) {
        throw new SdkError('MERKLE', 'Local merkle db unavailable', { chainId: input.chainId, cids, reason: 'missing_adapter_or_version' });
      }
    }

    // Remote fallback
    if (needsTreeProof.length === 0) {
      const root = contractTreeElements === 0 ? getZeroHash(this.treeDepth) : await this.fetchRemoteRootOnly(input.chainId);
      return {
        proof: cids.map((cid) => ({ leaf_index: cid, path: new Array(this.treeDepth + 1).fill('0') })),
        merkle_root: root,
        latest_cid: totalElements > 0n ? Number(totalElements - 1n) : -1,
      };
    }

    const remote = await this.fetchRemoteProofFromService({ chainId: input.chainId, cids: needsTreeProof });
    let remoteIdx = 0;
    return {
      merkle_root: remote.merkle_root,
      latest_cid: remote.latest_cid,
      proof: cids.map((cid) => {
        if (cid >= contractTreeElements) return { leaf_index: cid, path: new Array(this.treeDepth + 1).fill('0') };
        const hit = remote.proof[remoteIdx++];
        if (!hit) throw new SdkError('MERKLE', 'Remote merkle proof entry missing', { chainId: input.chainId, cid });
        return hit;
      }),
    };
  }

  /**
   * Build a local proof path by traversing the chairmanMerkle tree.
   *
   * Levels 0-4: sibling hashes from subtree internal nodes (st-{level}-{pos}).
   * Levels 5-31: sibling hashes from chairmanMerkle tree traversal (top-down from version root).
   */
  private async buildLocalProofPath(chainId: number, cid: number, version: ChairmanMerkleVersionRecord): Promise<Hex[]> {
    const leaf = await this.storage!.getMerkleLeaf!(chainId, cid);
    if (!leaf) throw new Error(`missing_leaf:${cid}`);
    const path: Hex[] = [leaf.commitment];

    // Levels 0-4: subtree internal siblings
    for (let level = 1; level <= SUBTREE_DEPTH; level++) {
      const siblingPos = (cid >> (level - 1)) ^ 1;
      if (level === 1) {
        const siblingLeaf = await this.storage!.getMerkleLeaf!(chainId, siblingPos);
        path.push(siblingLeaf?.commitment ?? getZeroHash(0));
      } else {
        const targetLevel = level - 1;
        const node = await this.storage!.getChairmanMerkleNode!(chainId, `st-${targetLevel}-${siblingPos}`);
        path.push(node?.hash ?? getZeroHash(targetLevel));
      }
    }

    // Levels 5-31: traverse chairmanMerkle tree from root to target batch
    const batchIndex = cid >> SUBTREE_DEPTH;
    const MAIN_DEPTH = this.treeDepth - SUBTREE_DEPTH;

    // Collect siblings top-down: depth 0 = root (level 32), depth MAIN_DEPTH-1 = just above leaf
    const mainSiblings: Hex[] = [];
    let nodeId: string | null = version.rootId;

    for (let depth = 0; depth < MAIN_DEPTH; depth++) {
      const childLevel = this.treeDepth - depth - 1;

      if (!nodeId) {
        mainSiblings.push(getZeroHash(childLevel));
        continue;
      }

      const node = await this.storage!.getChairmanMerkleNode!(chainId, nodeId);
      if (!node) {
        mainSiblings.push(getZeroHash(childLevel));
        nodeId = null;
        continue;
      }

      const remainingDepth = MAIN_DEPTH - depth - 1;
      const goRight = ((batchIndex >> remainingDepth) & 1) === 1;

      if (goRight) {
        const leftNode = node.leftId ? await this.storage!.getChairmanMerkleNode!(chainId, node.leftId) : null;
        mainSiblings.push(leftNode?.hash ?? getZeroHash(childLevel));
        nodeId = node.rightId;
      } else {
        const rightNode = node.rightId ? await this.storage!.getChairmanMerkleNode!(chainId, node.rightId) : null;
        mainSiblings.push(rightNode?.hash ?? getZeroHash(childLevel));
        nodeId = node.leftId;
      }
    }

    // mainSiblings[0] = sibling at level 31 → goes to path[32]
    // mainSiblings[MAIN_DEPTH-1] = sibling at level 5 → goes to path[6]
    // Reverse so path ordering is ascending by level
    for (let i = mainSiblings.length - 1; i >= 0; i--) {
      path.push(mainSiblings[i]!);
    }

    return path;
  }

  // ── Remote helpers ──

  private async fetchRemoteRootOnly(chainId: number): Promise<Hex> {
    const remote = await this.fetchRemoteProofFromService({ chainId, cids: [0] });
    return MerkleEngine.normalizeHex32(remote.merkle_root, 'remote.merkle_root');
  }

  private async fetchRemoteProofFromService(input: { chainId: number; cids: number[] }): Promise<RemoteMerkleProofResponse> {
    const chain = this.getChain(input.chainId);
    if (!chain.merkleProofUrl) {
      throw new SdkError('CONFIG', `Chain ${input.chainId} missing merkleProofUrl`);
    }
    const client = new MerkleClient(chain.merkleProofUrl);
    return client.getProofByCids(input.cids);
  }

  // ── Witness builders (unchanged) ──

  buildAccMemberWitnesses(input: { remote: RemoteMerkleProofResponse; utxos: Array<{ commitment: Hex; mkIndex: number }>; arrayHash: bigint; totalElements: bigint }): AccMemberWitness[] {
    return input.utxos.map((utxo, idx) => {
      const remoteProof = input.remote.proof[idx];
      if (!remoteProof) {
        throw new SdkError('MERKLE', 'Missing merkle proof entry for utxo index', { index: idx });
      }
      return {
        root: toDecString(input.remote.merkle_root),
        path: remoteProof.path.map((p) => toDecString(p)),
        index: Number(remoteProof.leaf_index),
      };
    });
  }

  async buildInputSecretsFromUtxos(input: {
    remote: RemoteMerkleProofResponse;
    utxos: Array<{ commitment: Hex; memo?: Hex; mkIndex: number }>;
    ownerKeyPair: UserKeyPair;
    arrayHash: bigint;
    totalElements: bigint;
    maxInputs?: number;
  }): Promise<InputSecret[]> {
    if (!Array.isArray(input.utxos) || input.utxos.length === 0) {
      throw new SdkError('MERKLE', 'No utxos provided', { count: 0 });
    }
    const maxInputs = input.maxInputs == null ? undefined : Math.max(0, Math.floor(input.maxInputs));
    if (typeof maxInputs === 'number' && input.utxos.length > maxInputs) {
      throw new SdkError('MERKLE', 'Too many input utxos for circuit', { count: input.utxos.length, maxInputs });
    }
    const owner = input.ownerKeyPair;
    const secretKey = typeof owner.user_sk.address_sk === 'bigint' ? owner.user_sk.address_sk : BigInt(owner.user_sk.address_sk);
    const ownerAddress = KeyManager.userPkToAddress(owner.user_pk);
    const witnesses = this.buildAccMemberWitnesses({
      remote: input.remote,
      utxos: input.utxos,
      arrayHash: input.arrayHash,
      totalElements: input.totalElements,
    });

    const out: InputSecret[] = [];
    let valid = 0;
    for (let i = 0; i < input.utxos.length; i++) {
      const utxo = input.utxos[i]!;
      const witness = witnesses[i]!;
      if (!utxo.memo) {
        out.push(await this.bridge.createDummyInputSecret());
        continue;
      }
      const ro = MemoKit.decodeMemoForOwner({
        secretKey,
        memo: utxo.memo,
        expectedAddress: ownerAddress,
      });
      if (!ro) {
        throw new SdkError('MERKLE', 'Failed to decrypt utxo memo', { commitment: utxo.commitment });
      }
      valid++;
      out.push({
        owner_keypair: owner,
        ro,
        acc_member_witness: witness,
      });
    }
    if (valid === 0) {
      throw new SdkError('MERKLE', 'No valid utxo found (missing memos)', {
        count: input.utxos.length,
        commitments: input.utxos.map((u) => u.commitment),
      });
    }

    if (typeof maxInputs === 'number') {
      while (out.length < maxInputs) {
        out.push(await this.bridge.createDummyInputSecret());
      }
    }
    return out;
  }
}
