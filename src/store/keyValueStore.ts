import type {
  EntryMemoRecord,
  EntryNullifierRecord,
  Hex,
  ListEntryMemosQuery,
  ListEntryNullifiersQuery,
  ListUtxosQuery,
  MerkleNodeRecord,
  MerkleTreeState,
  StorageAdapter,
  SyncCursor,
  UtxoRecord,
} from '../types';
import type { ListOperationsQuery, OperationDetailFor, OperationType, StoredOperation } from './operationTypes';
import type { PersistedWalletState } from './persistedWalletState';
import { hydrateWalletState, serializeWalletState } from './persistedWalletState';
import type { PersistedStoreState } from './persisted';
import { newOperationId } from './operationTypes';
import { applyOperationsQuery } from './operationsQuery';

export type KeyValueStoreOptions = {
  client: KeyValueClient;
  keyPrefix?: string;
  maxOperations?: number;
};

export class KeyValueStore implements StorageAdapter {
  private walletId: string | undefined;
  private readonly cursors = new Map<number, SyncCursor>();
  private readonly utxos = new Map<string, UtxoRecord>();
  private operations: Array<StoredOperation> = [];
  private merkleLeaves: Record<string, Array<{ cid: number; commitment: Hex }>> = {};
  private merkleTrees: Record<string, MerkleTreeState> = {};
  private merkleNodes: Record<string, Record<string, MerkleNodeRecord>> = {};
  private entryMemos: Record<string, EntryMemoRecord[]> = {};
  private entryNullifiers: Record<string, EntryNullifierRecord[]> = {};
  private saveChain: Promise<void> = Promise.resolve();
  private readonly maxOperations: number;

  constructor(private readonly options: KeyValueStoreOptions) {
    const max = options.maxOperations;
    this.maxOperations = max == null ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(max));
  }

  async init(options?: { walletId?: string }) {
    this.walletId = options?.walletId ?? this.walletId;
    await this.load();
  }

  async close() {
    await this.save();
  }

  private stateKey() {
    const prefix = this.options.keyPrefix ?? 'ocash:sdk:store';
    const id = this.walletId ?? 'default';
    return `${prefix}:${id}`;
  }

  private async load() {
    // Reset local state first; if the remote has no state for this wallet, we should not leak data from a previous walletId.
    this.cursors.clear();
    this.utxos.clear();
    this.operations = [];
    this.merkleLeaves = {};
    this.merkleTrees = {};
    this.merkleNodes = {};
    this.entryMemos = {};
    this.entryNullifiers = {};

    const raw = await this.options.client.get(this.stateKey());
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedStoreState>;
      const hydrated = hydrateWalletState(parsed.wallet as PersistedWalletState | undefined);
      for (const [k, v] of hydrated.cursors.entries()) this.cursors.set(k, v);
      for (const [k, v] of hydrated.utxos.entries()) this.utxos.set(k, v);

      const operations = Array.isArray(parsed.operations) ? (parsed.operations as StoredOperation[]) : [];
      this.operations = operations;

      const merkleLeavesRaw = (parsed as any).merkleLeaves;
      if (merkleLeavesRaw && typeof merkleLeavesRaw === 'object') {
        this.merkleLeaves = merkleLeavesRaw as any;
      }

      const merkleTreesRaw = (parsed as any).merkleTrees;
      if (merkleTreesRaw && typeof merkleTreesRaw === 'object') {
        this.merkleTrees = merkleTreesRaw as any;
      }

      const merkleNodesRaw = (parsed as any).merkleNodes;
      if (merkleNodesRaw && typeof merkleNodesRaw === 'object') {
        this.merkleNodes = merkleNodesRaw as any;
      }

      const entryMemosRaw = (parsed as any).entryMemos;
      if (entryMemosRaw && typeof entryMemosRaw === 'object') {
        this.entryMemos = entryMemosRaw as any;
      }

      const entryNullifiersRaw = (parsed as any).entryNullifiers;
      if (entryNullifiersRaw && typeof entryNullifiersRaw === 'object') {
        this.entryNullifiers = entryNullifiersRaw as any;
      }
    } catch {
      // ignore bad state
    }

    const pruned = this.pruneOperations();
    if (pruned) void this.save().catch(() => undefined);
  }

  private async save() {
    this.saveChain = this.saveChain
      .catch(() => undefined)
      .then(async () => {
        const wallet = serializeWalletState({ walletId: this.walletId, cursors: this.cursors, utxos: this.utxos });
        const state: PersistedStoreState = {
          wallet,
          operations: this.operations,
          merkleLeaves: this.merkleLeaves,
          merkleTrees: this.merkleTrees,
          merkleNodes: this.merkleNodes,
          entryMemos: this.entryMemos,
          entryNullifiers: this.entryNullifiers,
        };
        await this.options.client.set(this.stateKey(), JSON.stringify(state));
      });
    return this.saveChain;
  }

  async getMerkleNode(chainId: number, id: string): Promise<MerkleNodeRecord | undefined> {
    const node = this.merkleNodes[String(chainId)]?.[id];
    if (!node) return undefined;
    const hash = (node as any).hash as Hex;
    if (typeof hash !== 'string' || !hash.startsWith('0x')) return undefined;
    return { ...(node as any), chainId };
  }

  async upsertMerkleNodes(chainId: number, nodes: MerkleNodeRecord[]): Promise<void> {
    if (!nodes.length) return;
    const key = String(chainId);
    const existing = this.merkleNodes[key] ?? {};
    for (const node of nodes) {
      existing[node.id] = { ...node, chainId };
    }
    this.merkleNodes[key] = existing;
    await this.save();
  }

  async clearMerkleNodes(chainId: number): Promise<void> {
    delete this.merkleNodes[String(chainId)];
    await this.save();
  }

  async getMerkleTree(chainId: number): Promise<MerkleTreeState | undefined> {
    const row = this.merkleTrees[String(chainId)];
    if (!row) return undefined;
    const totalElements = Number((row as any).totalElements);
    const lastUpdated = Number((row as any).lastUpdated);
    const root = (row as any).root as Hex;
    if (typeof root !== 'string' || !root.startsWith('0x')) return undefined;
    if (!Number.isFinite(totalElements) || totalElements < 0) return undefined;
    return { chainId, root, totalElements: Math.floor(totalElements), lastUpdated: Number.isFinite(lastUpdated) ? Math.floor(lastUpdated) : 0 };
  }

  async setMerkleTree(chainId: number, tree: MerkleTreeState): Promise<void> {
    this.merkleTrees[String(chainId)] = { ...tree, chainId };
    await this.save();
  }

  async clearMerkleTree(chainId: number): Promise<void> {
    delete this.merkleTrees[String(chainId)];
    await this.save();
  }

  async upsertEntryMemos(memos: EntryMemoRecord[]): Promise<number> {
    let updated = 0;
    const grouped = new Map<number, EntryMemoRecord[]>();
    for (const memo of memos) {
      if (!Number.isInteger(memo.cid) || memo.cid < 0) continue;
      const list = grouped.get(memo.chainId) ?? [];
      list.push(memo);
      grouped.set(memo.chainId, list);
    }
    for (const [chainId, list] of grouped.entries()) {
      const key = String(chainId);
      const existing = Array.isArray(this.entryMemos[key]) ? this.entryMemos[key]! : [];
      const byCid = new Map<number, EntryMemoRecord>();
      for (const row of existing) {
        const cid = Number((row as any).cid);
        if (!Number.isFinite(cid) || cid < 0) continue;
        byCid.set(Math.floor(cid), row as any);
      }
      for (const row of list) {
        if (!byCid.has(row.cid)) updated++;
        byCid.set(row.cid, { ...row });
      }
      this.entryMemos[key] = Array.from(byCid.values()).sort((a, b) => a.cid - b.cid);
    }
    if (updated) await this.save();
    return updated;
  }

  async listEntryMemos(query: ListEntryMemosQuery): Promise<EntryMemoRecord[]> {
    const rows = this.entryMemos[String(query.chainId)];
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const limit = query.limit == null ? undefined : Math.max(0, Math.floor(query.limit));
    const paged = limit == null ? rows.slice(offset) : rows.slice(offset, offset + limit);
    return paged.map((r) => ({ ...(r as any) }));
  }

  async clearEntryMemos(chainId: number): Promise<void> {
    delete this.entryMemos[String(chainId)];
    await this.save();
  }

  async upsertEntryNullifiers(nullifiers: EntryNullifierRecord[]): Promise<number> {
    let updated = 0;
    const grouped = new Map<number, EntryNullifierRecord[]>();
    for (const row of nullifiers) {
      const list = grouped.get(row.chainId) ?? [];
      list.push(row);
      grouped.set(row.chainId, list);
    }
    for (const [chainId, list] of grouped.entries()) {
      const key = String(chainId);
      const existing = Array.isArray(this.entryNullifiers[key]) ? this.entryNullifiers[key]! : [];
      const byNid = new Map<number, EntryNullifierRecord>();
      for (const row of existing) {
        const nid = Number((row as any).nid);
        if (!Number.isFinite(nid) || nid < 0) continue;
        byNid.set(Math.floor(nid), row as any);
      }
      for (const row of list) {
        if (!Number.isInteger(row.nid) || row.nid < 0) continue;
        if (!byNid.has(row.nid)) updated++;
        byNid.set(row.nid, { ...row });
      }
      this.entryNullifiers[key] = Array.from(byNid.values()).sort((a, b) => a.nid - b.nid);
    }
    if (updated) await this.save();
    return updated;
  }

  async listEntryNullifiers(query: ListEntryNullifiersQuery): Promise<EntryNullifierRecord[]> {
    const rows = this.entryNullifiers[String(query.chainId)];
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const limit = query.limit == null ? undefined : Math.max(0, Math.floor(query.limit));
    const paged = limit == null ? rows.slice(offset) : rows.slice(offset, offset + limit);
    return paged.map((r) => ({ ...(r as any) }));
  }

  async clearEntryNullifiers(chainId: number): Promise<void> {
    delete this.entryNullifiers[String(chainId)];
    await this.save();
  }

  async getMerkleLeaves(chainId: number): Promise<Array<{ cid: number; commitment: Hex }> | undefined> {
    const rows = this.merkleLeaves[String(chainId)];
    if (!Array.isArray(rows) || rows.length === 0) return undefined;
    const out: Array<{ cid: number; commitment: Hex }> = [];
    for (const row of rows) {
      const cid = Number((row as any)?.cid);
      const commitment = (row as any)?.commitment as Hex;
      if (!Number.isFinite(cid) || cid < 0) continue;
      if (typeof commitment !== 'string' || !commitment.startsWith('0x')) continue;
      out.push({ cid: Math.floor(cid), commitment });
    }
    out.sort((a, b) => a.cid - b.cid);
    return out.length ? out : undefined;
  }

  async getMerkleLeaf(chainId: number, cid: number) {
    const rows = await this.getMerkleLeaves(chainId);
    const row = rows?.[cid];
    if (!row) return undefined;
    return { chainId, cid: row.cid, commitment: row.commitment };
  }

  async appendMerkleLeaves(chainId: number, leaves: Array<{ cid: number; commitment: Hex }>): Promise<void> {
    if (!leaves.length) return;
    const key = String(chainId);
    const existing = (await this.getMerkleLeaves(chainId)) ?? [];
    const sorted = [...leaves].sort((a, b) => a.cid - b.cid);
    let next = existing.length;
    const fresh = sorted.filter((l) => Number.isFinite(l.cid) && l.cid >= next);
    if (!fresh.length) {
      this.merkleLeaves[key] = existing;
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
    this.merkleLeaves[key] = existing;
    await this.save();
  }

  async clearMerkleLeaves(chainId: number): Promise<void> {
    delete this.merkleLeaves[String(chainId)];
    await this.save();
  }

  async getSyncCursor(chainId: number): Promise<SyncCursor | undefined> {
    const cursor = this.cursors.get(chainId);
    return cursor ? { ...cursor } : undefined;
  }

  async setSyncCursor(chainId: number, cursor: SyncCursor): Promise<void> {
    this.cursors.set(chainId, { ...cursor });
    await this.save();
  }

  async upsertUtxos(utxos: UtxoRecord[]): Promise<void> {
    for (const utxo of utxos) {
      const key = `${utxo.chainId}:${utxo.commitment}`;
      const prev = this.utxos.get(key);
      this.utxos.set(key, { ...utxo, isSpent: prev?.isSpent ?? utxo.isSpent });
    }
    await this.save();
  }

  async listUtxos(query?: ListUtxosQuery): Promise<UtxoRecord[]> {
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
    return paged.map((utxo) => ({ ...utxo }));
  }

  async markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<number> {
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
    if (updated) await this.save();
    return updated;
  }

  createOperation<TType extends OperationType>(
    input: Omit<StoredOperation<OperationDetailFor<TType>>, 'id' | 'createdAt' | 'status'> & Partial<Pick<StoredOperation<OperationDetailFor<TType>>, 'createdAt' | 'id' | 'status'>> & { type: TType },
  ) {
    const created = {
      ...(input as StoredOperation<OperationDetailFor<TType>>),
      id: input.id ?? newOperationId(),
      createdAt: input.createdAt ?? Date.now(),
      status: input.status ?? 'created',
    } as StoredOperation<OperationDetailFor<TType>> & { type: TType };
    this.operations.unshift(created);
    this.pruneOperations();
    void this.save().catch(() => undefined);
    return created;
  }

  updateOperation(id: string, patch: Partial<StoredOperation>) {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return;
    this.operations[idx] = { ...this.operations[idx]!, ...patch };
    void this.save().catch(() => undefined);
  }

  deleteOperation(id: string): boolean {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return false;
    this.operations.splice(idx, 1);
    void this.save().catch(() => undefined);
    return true;
  }

  clearOperations(): void {
    this.operations = [];
    void this.save().catch(() => undefined);
  }

  pruneOperations(options?: { max?: number }): number {
    const limit = Math.max(0, Math.floor(options?.max ?? this.maxOperations));
    const before = this.operations.length;
    this.operations = this.operations.slice(0, limit);
    return before - this.operations.length;
  }

  listOperations(input?: number | ListOperationsQuery) {
    return applyOperationsQuery(this.operations, input);
  }
}

export type RedisStoreOptions = KeyValueStoreOptions;
export class RedisStore extends KeyValueStore {
  constructor(options: RedisStoreOptions) {
    super({ ...options, keyPrefix: options.keyPrefix ?? 'ocash:sdk:redis:store' });
  }
}

export type SqliteStoreOptions = KeyValueStoreOptions;
export class SqliteStore extends KeyValueStore {
  constructor(options: SqliteStoreOptions) {
    super({ ...options, keyPrefix: options.keyPrefix ?? 'ocash:sdk:sqlite:store' });
  }
}

export interface KeyValueClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del?(key: string): Promise<void>;
}
