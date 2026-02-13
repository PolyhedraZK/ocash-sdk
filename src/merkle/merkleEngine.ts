import type { MerkleApi, ProofBridge, RemoteMerkleProofResponse, Hex, AccMemberWitness, InputSecret, MerkleNodeRecord, StorageAdapter, UserKeyPair } from '../types';
import { SdkError } from '../errors';
import { MerkleClient } from './merkleClient';
import { getZeroHash, TREE_DEPTH_DEFAULT } from './zeroHashes';
import { Poseidon2, Poseidon2Domain } from '../crypto/poseidon2';
import { MemoKit } from '../memo/memoKit';
import { KeyManager } from '../crypto/keyManager';

const TEMP_ARRAY_SIZE_DEFAULT = 32;
const SUBTREE_SIZE = 32;
const SUBTREE_DEPTH = 5;

const toDecString = (value: string | bigint) => {
  try {
    return typeof value === 'bigint' ? value.toString() : BigInt(value).toString();
  } catch {
    return String(value);
  }
};

export class MerkleEngine implements MerkleApi {
  private readonly mode: 'remote' | 'local' | 'hybrid';
  private readonly treeDepth: number;
  private readonly pendingLeavesByChain = new Map<number, Hex[]>();
  private readonly chainStateByChain = new Map<number, { mergedElements: number; root: Hex }>();
  private readonly hydratedChains = new Set<number>();
  private readonly hydrateInFlight = new Map<number, Promise<void>>();

  constructor(
    private readonly getChain: (chainId: number) => { merkleProofUrl?: string },
    private readonly bridge: ProofBridge,
    options?: { mode?: 'remote' | 'local' | 'hybrid'; treeDepth?: number },
    private readonly storage?: Pick<
      StorageAdapter,
      | 'getMerkleLeaves'
      | 'appendMerkleLeaves'
      | 'clearMerkleLeaves'
      | 'getMerkleLeaf'
      | 'getMerkleNode'
      | 'upsertMerkleNodes'
      | 'clearMerkleNodes'
      | 'getMerkleTree'
      | 'setMerkleTree'
      | 'clearMerkleTree'
    >,
  ) {
    this.mode = options?.mode ?? 'hybrid';
    this.treeDepth = Math.max(1, Math.floor(options?.treeDepth ?? TREE_DEPTH_DEFAULT));
  }

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

  private static hashPair(left: Hex, right: Hex): Hex {
    return Poseidon2.hashToHex(BigInt(left), BigInt(right), Poseidon2Domain.Merkle);
  }

  private static buildSubtree(leafCommitments: Hex[], baseIndex: number): { subtreeRoot: Hex; nodesToStore: MerkleNodeRecord[] } {
    if (leafCommitments.length !== SUBTREE_SIZE) {
      throw new SdkError('MERKLE', 'Subtree must have exactly 32 leaf nodes', { got: leafCommitments.length });
    }
    if (baseIndex % SUBTREE_SIZE !== 0) {
      throw new SdkError('MERKLE', 'Subtree baseIndex must be aligned to 32', { baseIndex });
    }
    const nodesToStore: MerkleNodeRecord[] = [];
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
          id: `${level}-${position}`,
          level,
          position,
          hash: next[i]!,
        });
      }
      currentLevel = next;
    }
    return { subtreeRoot: currentLevel[0]!, nodesToStore };
  }

  private async getNodeHash(chainId: number, id: string): Promise<Hex | undefined> {
    const node = await this.storage?.getMerkleNode?.(chainId, id);
    return node?.hash;
  }

  private async mergeSubtreeToMainTree(input: { chainId: number; subtreeRoot: Hex; newTotalElements: number }): Promise<{ finalRoot: Hex; nodesToStore: MerkleNodeRecord[] }> {
    let currentValue = input.subtreeRoot;
    let frontierUpdated = false;
    const nodesToStore: MerkleNodeRecord[] = [];

    for (let level = SUBTREE_DEPTH; level < this.treeDepth; level++) {
      const nodeIndex = (input.newTotalElements - 1) >> level;

      if ((nodeIndex & 1) === 0) {
        if (!frontierUpdated) {
          nodesToStore.push({
            chainId: input.chainId,
            id: `frontier-${level}`,
            level,
            position: nodeIndex,
            hash: currentValue,
          });
          frontierUpdated = true;
        }
        currentValue = MerkleEngine.hashPair(currentValue, getZeroHash(level));
      } else {
        const leftHash = (await this.getNodeHash(input.chainId, `frontier-${level}`)) ?? getZeroHash(level);
        currentValue = MerkleEngine.hashPair(leftHash, currentValue);
      }

      const nextLevel = level + 1;
      nodesToStore.push({
        chainId: input.chainId,
        id: `${nextLevel}-${nodeIndex >> 1}`,
        level: nextLevel,
        position: nodeIndex >> 1,
        hash: currentValue,
      });
    }

    return { finalRoot: currentValue, nodesToStore };
  }

  private static totalElementsInTree(totalElements: bigint, tempArraySize: number = TEMP_ARRAY_SIZE_DEFAULT): number {
    if (tempArraySize <= 0) throw new SdkError('MERKLE', 'tempArraySize must be greater than zero', { tempArraySize });
    if (totalElements <= 0n) return 0;
    const size = BigInt(tempArraySize);
    return Number(((totalElements - 1n) / size) * size);
  }

  private async hydrateFromStorage(chainId: number) {
    if (this.mode === 'remote') return;
    if (this.hydratedChains.has(chainId)) return;
    const existing = this.hydrateInFlight.get(chainId);
    if (existing) return existing;

    const task = (async () => {
      try {
        const state = this.ensureChainState(chainId);
        const leaves = await this.storage?.getMerkleLeaves?.(chainId);
        if (!leaves || leaves.length === 0) return;
        const sorted = [...leaves]
          .map((l) => ({
            cid: l.cid,
            commitment: MerkleEngine.normalizeHex32(l.commitment, 'memo.commitment'),
          }))
          .sort((a, b) => a.cid - b.cid);
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i]!.cid !== i) throw new Error(`Non-contiguous persisted merkle leaves: expected cid=${i}, got cid=${sorted[i]!.cid}`);
        }

        const totalElements = BigInt(sorted.length);
        const mergedElements = MerkleEngine.totalElementsInTree(totalElements);

        const pending = this.ensurePendingLeaves(chainId);
        pending.length = 0;
        state.mergedElements = mergedElements;

        if (sorted.length > mergedElements) {
          pending.push(...sorted.slice(mergedElements).map((l) => l.commitment));
        }

        const storedTree = await this.storage?.getMerkleTree?.(chainId);
        if (storedTree?.root) {
          state.root = MerkleEngine.normalizeHex32(storedTree.root, 'merkleTree.root');
        } else {
          const rootNode = await this.storage?.getMerkleNode?.(chainId, `${this.treeDepth}-0`);
          state.root = rootNode?.hash ?? getZeroHash(this.treeDepth);
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

  private static normalizeHex32(value: unknown, name: string): Hex {
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

  /**
   * Feed contiguous (cid-ordered) memo leaves into the local merkle tree.
   *
   * This mirrors the client/app behavior: only after we have a full consecutive batch of 32 leaves
   * do we merge them into the main tree. Leaves that are still in the buffer do not get local proofs.
   */
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
    void this.storage?.appendMerkleLeaves?.(chainId, persistLeaves).catch(() => undefined);

    try {
      let expected = state.mergedElements + pending.length;
      for (const leaf of sorted) {
        if (leaf.index < expected) continue; // already ingested/persisted
        if (leaf.index !== expected) {
          throw new Error(`Non-contiguous merkle leaves: expected index=${expected}, got index=${leaf.index}`);
        }
        pending.push(leaf.commitment);
        expected++;

        while (pending.length >= SUBTREE_SIZE) {
          const batch = pending.splice(0, SUBTREE_SIZE);
          const baseIndex = state.mergedElements;
          const subtree = MerkleEngine.buildSubtree(batch, baseIndex);
          const merged = await this.mergeSubtreeToMainTree({ chainId, subtreeRoot: subtree.subtreeRoot, newTotalElements: baseIndex + SUBTREE_SIZE });

          const nodes = [...subtree.nodesToStore, ...merged.nodesToStore].map((n) => ({ ...n, chainId }));
          await this.storage?.upsertMerkleNodes?.(chainId, nodes);

          state.mergedElements += SUBTREE_SIZE;
          state.root = merged.finalRoot;
          await this.storage?.setMerkleTree?.(chainId, {
            chainId,
            root: state.root,
            totalElements: state.mergedElements,
            lastUpdated: Date.now(),
          });
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
      const tree = await this.storage?.getMerkleTree?.(input.chainId);
      const hasDb = typeof this.storage?.getMerkleLeaf === 'function' && typeof this.storage?.getMerkleNode === 'function' && typeof tree?.totalElements === 'number' && typeof tree?.root === 'string';

      if (hasDb && tree) {
        if (tree.totalElements < contractTreeElements) {
          if (this.mode === 'local') {
            throw new SdkError('MERKLE', 'Local merkle db is behind contract', {
              chainId: input.chainId,
              cids,
              localTotalElements: tree.totalElements,
              contractTreeElements,
            });
          }
          // hybrid fallback: remote proof service will be authoritative.
        } else {
          try {
            const proof = [];
            for (const cid of cids) {
              if (cid >= contractTreeElements) {
                proof.push({ leaf_index: cid, path: new Array(this.treeDepth + 1).fill('0') });
                continue;
              }
              const leaf = await this.storage!.getMerkleLeaf!(input.chainId, cid);
              if (!leaf) throw new Error(`missing_leaf:${cid}`);
              const path: Hex[] = [leaf.commitment];
              for (let level = 1; level <= this.treeDepth; level++) {
                const siblingIndex = (cid >> (level - 1)) ^ 1;
                if (level === 1) {
                  const siblingLeaf = await this.storage!.getMerkleLeaf!(input.chainId, siblingIndex);
                  path.push(siblingLeaf?.commitment ?? getZeroHash(0));
                  continue;
                }
                const targetLevel = level - 1;
                const siblingNode = await this.storage!.getMerkleNode!(input.chainId, `${targetLevel}-${siblingIndex}`);
                path.push(siblingNode?.hash ?? getZeroHash(targetLevel));
              }
              proof.push({ leaf_index: cid, path });
            }
            return {
              proof,
              merkle_root: MerkleEngine.normalizeHex32(tree.root, 'merkleTree.root'),
              latest_cid: totalElements > 0n ? Number(totalElements - 1n) : -1,
            };
          } catch (error) {
            if (this.mode === 'local') {
              throw new SdkError('MERKLE', 'Local merkle proof build failed', { chainId: input.chainId, cids }, error);
            }
            // hybrid fallback: ignore and try remote proof server
          }
        }
      } else if (this.mode === 'local' && needsTreeProof.length) {
        throw new SdkError('MERKLE', 'Local merkle db unavailable', { chainId: input.chainId, cids, reason: 'missing_adapter_merkle_db' });
      }
    }

    // Remote fallback: only fetch proofs for leaves that are already merged into the main tree.
    // Leaves still sitting in the on-chain buffer do not have Merkle proofs yet.
    if (needsTreeProof.length === 0) {
      // We still need a stable root for witness generation.
      // If nothing has been merged into the tree yet, the root is the depth-level zero hash.
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
