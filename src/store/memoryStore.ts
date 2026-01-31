import type {
  EntryMemoRecord,
  EntryNullifierRecord,
  ListEntryMemosQuery,
  ListEntryNullifiersQuery,
  ListUtxosQuery,
  MerkleLeafRecord,
  MerkleNodeRecord,
  MerkleTreeState,
  StorageAdapter,
  SyncCursor,
  UtxoRecord,
  Hex,
} from '../types';
import type { ListOperationsQuery, OperationDetailFor, OperationType, StoredOperation } from './operationTypes';
import { newOperationId } from './operationTypes';
import { applyOperationsQuery } from './operationsQuery';

export class MemoryStore implements StorageAdapter {
  private walletId: string | undefined;
  private readonly cursors = new Map<number, SyncCursor>();
  private readonly utxos = new Map<string, UtxoRecord>();
  private operations: Array<StoredOperation> = [];
  private readonly merkleLeavesByChain = new Map<number, Array<{ cid: number; commitment: Hex }>>();
  private readonly merkleTreesByChain = new Map<number, MerkleTreeState>();
  private readonly merkleNodesByChain = new Map<number, Map<string, MerkleNodeRecord>>();
  private readonly entryMemosByChain = new Map<number, Map<number, EntryMemoRecord>>();
  private readonly entryNullifiersByChain = new Map<number, Map<number, EntryNullifierRecord>>();
  private readonly maxOperations: number;

  constructor(options?: { maxOperations?: number }) {
    const max = options?.maxOperations;
    this.maxOperations = max == null ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(max));
  }

  init(options?: { walletId?: string }) {
    const nextWalletId = options?.walletId ?? this.walletId;
    if (nextWalletId !== this.walletId) {
      this.cursors.clear();
      this.utxos.clear();
      this.operations = [];
      this.merkleLeavesByChain.clear();
      this.merkleTreesByChain.clear();
      this.merkleNodesByChain.clear();
      this.entryMemosByChain.clear();
      this.entryNullifiersByChain.clear();
    }
    this.walletId = nextWalletId;
  }

  close() {
    // no-op
  }

  private enforceMaxOperations(): number {
    if (!Number.isFinite(this.maxOperations)) return 0;
    const before = this.operations.length;
    this.operations = this.operations.slice(0, this.maxOperations);
    return before - this.operations.length;
  }

  getSyncCursor(chainId: number): Promise<SyncCursor | undefined> {
    const cursor = this.cursors.get(chainId);
    return Promise.resolve(cursor ? { ...cursor } : undefined);
  }

  setSyncCursor(chainId: number, cursor: SyncCursor): Promise<void> {
    this.cursors.set(chainId, { ...cursor });
    return Promise.resolve();
  }

  upsertUtxos(utxos: UtxoRecord[]): Promise<void> {
    for (const utxo of utxos) {
      const key = `${utxo.chainId}:${utxo.commitment}`;
      const prev = this.utxos.get(key);
      this.utxos.set(key, { ...utxo, isSpent: prev?.isSpent ?? utxo.isSpent });
    }
    return Promise.resolve();
  }

  listUtxos(query?: ListUtxosQuery): Promise<UtxoRecord[]> {
    const includeSpent = query?.includeSpent ?? false;
    const includeFrozen = query?.includeFrozen ?? false;
    const records = Array.from(this.utxos.values()).filter((utxo) => {
      if (query?.chainId != null && utxo.chainId !== query.chainId) return false;
      if (query?.assetId != null && utxo.assetId !== query.assetId) return false;
      if (!includeSpent && utxo.isSpent) return false;
      if (!includeFrozen && utxo.isFrozen) return false;
      return true;
    });
    const offset = Math.max(0, Math.floor(query?.offset ?? 0));
    const limit = query?.limit == null ? undefined : Math.max(0, Math.floor(query.limit));
    const paged = limit == null ? records.slice(offset) : records.slice(offset, offset + limit);
    return Promise.resolve(paged.map((utxo) => ({ ...utxo })));
  }

  markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<number> {
    const wanted = new Set(input.nullifiers.map((nf) => nf.toLowerCase()));
    let updated = 0;
    for (const [key, utxo] of this.utxos.entries()) {
      if (utxo.chainId !== input.chainId) continue;
      if (!wanted.has(utxo.nullifier.toLowerCase())) continue;
      if (!utxo.isSpent) {
        this.utxos.set(key, { ...utxo, isSpent: true });
        updated++;
      }
    }
    return Promise.resolve(updated);
  }

  async getMerkleLeaves(chainId: number): Promise<Array<{ cid: number; commitment: Hex }> | undefined> {
    const rows = this.merkleLeavesByChain.get(chainId);
    if (!rows || rows.length === 0) return undefined;
    return rows.map((r) => ({ ...r }));
  }

  async appendMerkleLeaves(chainId: number, leaves: Array<{ cid: number; commitment: Hex }>): Promise<void> {
    if (!leaves.length) return;
    const sorted = [...leaves].sort((a, b) => a.cid - b.cid);
    const existing = this.merkleLeavesByChain.get(chainId) ?? [];
    let next = existing.length;

    // Drop already persisted leaves (e.g. when resyncing from cid=0)
    const fresh = sorted.filter((l) => Number.isFinite(l.cid) && l.cid >= next);
    if (!fresh.length) {
      this.merkleLeavesByChain.set(chainId, existing);
      return;
    }
    if (fresh[0]!.cid !== next) {
      throw new Error(`Non-contiguous merkle leaves append: expected cid=${next}, got cid=${fresh[0]!.cid}`);
    }
    for (const row of fresh) {
      if (row.cid !== next) throw new Error(`Non-contiguous merkle leaves append: expected cid=${next}, got cid=${row.cid}`);
      existing.push({ cid: row.cid, commitment: row.commitment });
      next++;
    }
    this.merkleLeavesByChain.set(chainId, existing);
  }

  async clearMerkleLeaves(chainId: number): Promise<void> {
    this.merkleLeavesByChain.delete(chainId);
  }

  async getMerkleLeaf(chainId: number, cid: number): Promise<MerkleLeafRecord | undefined> {
    const rows = this.merkleLeavesByChain.get(chainId);
    const row = rows?.[cid];
    if (!row) return undefined;
    return { chainId, cid: row.cid, commitment: row.commitment };
  }

  async getMerkleNode(chainId: number, id: string): Promise<MerkleNodeRecord | undefined> {
    return this.merkleNodesByChain.get(chainId)?.get(id);
  }

  async upsertMerkleNodes(chainId: number, nodes: MerkleNodeRecord[]): Promise<void> {
    if (!nodes.length) return;
    let map = this.merkleNodesByChain.get(chainId);
    if (!map) {
      map = new Map();
      this.merkleNodesByChain.set(chainId, map);
    }
    for (const node of nodes) {
      map.set(node.id, { ...node, chainId });
    }
  }

  async clearMerkleNodes(chainId: number): Promise<void> {
    this.merkleNodesByChain.delete(chainId);
  }

  async getMerkleTree(chainId: number): Promise<MerkleTreeState | undefined> {
    const tree = this.merkleTreesByChain.get(chainId);
    return tree ? { ...tree } : undefined;
  }

  async setMerkleTree(chainId: number, tree: MerkleTreeState): Promise<void> {
    this.merkleTreesByChain.set(chainId, { ...tree, chainId });
  }

  async clearMerkleTree(chainId: number): Promise<void> {
    this.merkleTreesByChain.delete(chainId);
  }

  async upsertEntryMemos(memos: EntryMemoRecord[]): Promise<number> {
    let updated = 0;
    for (const memo of memos) {
      if (!Number.isInteger(memo.cid) || memo.cid < 0) continue;
      let byCid = this.entryMemosByChain.get(memo.chainId);
      if (!byCid) {
        byCid = new Map();
        this.entryMemosByChain.set(memo.chainId, byCid);
      }
      const prev = byCid.get(memo.cid);
      if (!prev) updated++;
      byCid.set(memo.cid, { ...memo });
    }
    return updated;
  }

  async listEntryMemos(query: ListEntryMemosQuery): Promise<EntryMemoRecord[]> {
    const byCid = this.entryMemosByChain.get(query.chainId);
    if (!byCid || byCid.size === 0) return [];
    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const limit = query.limit == null ? undefined : Math.max(0, Math.floor(query.limit));
    const rows = Array.from(byCid.values()).sort((a, b) => a.cid - b.cid);
    const paged = limit == null ? rows.slice(offset) : rows.slice(offset, offset + limit);
    return paged.map((r) => ({ ...r }));
  }

  async clearEntryMemos(chainId: number): Promise<void> {
    this.entryMemosByChain.delete(chainId);
  }

  async upsertEntryNullifiers(nullifiers: EntryNullifierRecord[]): Promise<number> {
    let updated = 0;
    for (const row of nullifiers) {
      if (!Number.isInteger(row.nid) || row.nid < 0) continue;
      let byNid = this.entryNullifiersByChain.get(row.chainId);
      if (!byNid) {
        byNid = new Map();
        this.entryNullifiersByChain.set(row.chainId, byNid);
      }
      if (!byNid.has(row.nid)) updated++;
      byNid.set(row.nid, { ...row });
    }
    return updated;
  }

  async listEntryNullifiers(query: ListEntryNullifiersQuery): Promise<EntryNullifierRecord[]> {
    const byNid = this.entryNullifiersByChain.get(query.chainId);
    if (!byNid || byNid.size === 0) return [];
    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const limit = query.limit == null ? undefined : Math.max(0, Math.floor(query.limit));
    const rows = Array.from(byNid.values()).sort((a, b) => a.nid - b.nid);
    const paged = limit == null ? rows.slice(offset) : rows.slice(offset, offset + limit);
    return paged.map((r) => ({ ...r }));
  }

  async clearEntryNullifiers(chainId: number): Promise<void> {
    this.entryNullifiersByChain.delete(chainId);
  }

  createOperation<TType extends OperationType>(
    input: Omit<StoredOperation<OperationDetailFor<TType>>, 'id' | 'createdAt' | 'status'> & Partial<Pick<StoredOperation<OperationDetailFor<TType>>, 'createdAt' | 'id' | 'status'>> & { type: TType },
  ): StoredOperation<OperationDetailFor<TType>> & { type: TType } {
    const created = {
      ...(input as StoredOperation<OperationDetailFor<TType>>),
      id: input.id ?? newOperationId(),
      createdAt: input.createdAt ?? Date.now(),
      status: input.status ?? 'created',
    } as StoredOperation<OperationDetailFor<TType>> & { type: TType };
    this.operations.unshift(created);
    this.enforceMaxOperations();
    return created;
  }

  updateOperation(id: string, patch: Partial<StoredOperation>): void {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return;
    this.operations[idx] = { ...this.operations[idx]!, ...patch };
  }

  deleteOperation(id: string): boolean {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return false;
    this.operations.splice(idx, 1);
    return true;
  }

  clearOperations(): void {
    this.operations = [];
  }

  pruneOperations(options?: { max?: number }): number {
    const max = options?.max;
    const limit = max == null ? this.maxOperations : Math.max(0, Math.floor(max));
    const before = this.operations.length;
    this.operations = this.operations.slice(0, limit);
    return before - this.operations.length;
  }

  listOperations(input?: number | ListOperationsQuery): StoredOperation[] {
    return applyOperationsQuery(this.operations, input);
  }
}
