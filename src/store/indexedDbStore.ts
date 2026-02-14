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
import type { PersistedWalletState } from './persistedWalletState';
import { hydrateWalletState, serializeWalletState } from './persistedWalletState';
import type { ListOperationsQuery, OperationDetailFor, OperationType, StoredOperation } from './operationTypes';
import { newOperationId } from './operationTypes';
import type { PersistedStoreState } from './persisted';
import { applyOperationsQuery } from './operationsQuery';
import { applyEntryMemoQuery } from './entryMemoQuery';
import { applyEntryNullifierQuery } from './entryNullifierQuery';
import { applyUtxoQuery } from './utxoQuery';

export type IndexedDbStoreOptions = {
  dbName?: string;
  storeName?: string;
  indexedDb?: IDBFactory;
  maxOperations?: number;
};

type StateRow = { id: string; json: PersistedStoreState };

/**
 * IndexedDB-backed StorageAdapter for browser environments.
 */
export class IndexedDbStore implements StorageAdapter {
  private walletId: string | undefined;
  private readonly cursors = new Map<number, SyncCursor>();
  private readonly utxos = new Map<string, UtxoRecord>();
  private operations: Array<StoredOperation> = [];
  private merkleLeaves: Record<string, Array<{ cid: number; commitment: Hex }>> = {};
  private merkleTrees: Record<string, MerkleTreeState> = {};
  private merkleNodes: Record<string, Record<string, MerkleNodeRecord>> = {};
  private entryMemos: Record<string, EntryMemoRecord[]> = {};
  private entryNullifiers: Record<string, EntryNullifierRecord[]> = {};
  private db: IDBDatabase | null = null;
  private saveChain: Promise<void> = Promise.resolve();
  private readonly maxOperations: number;

  /**
   * Create an IndexedDbStore with optional database settings.
   */
  constructor(private readonly options: IndexedDbStoreOptions = {}) {
    const max = options.maxOperations;
    this.maxOperations = max == null ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(max));
  }

  /**
   * Initialize store for a wallet id and load persisted state.
   */
  async init(options?: { walletId?: string }) {
    this.walletId = options?.walletId ?? this.walletId;
    await this.load();
  }

  /**
   * Persist state, close the DB connection, and clear handle.
   */
  async close() {
    await this.save();
    this.db?.close();
    this.db = null;
  }

  /**
   * Resolve object store name (default: ocash_store).
   */
  private storeName() {
    return this.options.storeName ?? 'ocash_store';
  }

  /**
   * Open IndexedDB and ensure the store exists (create on upgrade).
   */
  private async openDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    const factory: IDBFactory | undefined = this.options.indexedDb ?? globalThis.indexedDB;
    if (!factory) throw new Error('indexedDB is not available');
    const name = this.options.dbName ?? 'ocash_sdk';
    const storeName = this.storeName();

    const open = (version?: number) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = version == null ? factory.open(name) : factory.open(name, version);
        req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
      });

    // First open current DB. If the target store doesn't exist (e.g. storeName changed),
    // reopen with a bumped version to create it.
    let db = await open();
    if (!db.objectStoreNames.contains(storeName)) {
      const currentVersion = db.version;
      const nextVersion = typeof currentVersion === 'number' && currentVersion > 0 ? currentVersion + 1 : 2;
      db.close();
      db = await open(nextVersion);
    }

    this.db = db;
    return db;
  }

  /**
   * Compute the row id for current wallet scope.
   */
  private stateId() {
    return this.walletId ?? 'default';
  }

  /**
   * Load persisted state into memory and normalize it.
   */
  private async load() {
    const db = await this.openDb();
    const storeName = this.storeName();
    const id = this.stateId();

    const row = await new Promise<StateRow | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onerror = () => reject(req.error ?? new Error('indexedDB get failed'));
      req.onsuccess = () => resolve(req.result as StateRow | undefined);
    });

    // Reset local state first; if the remote has no/invalid state for this wallet, we should not leak old data.
    this.cursors.clear();
    this.utxos.clear();
    this.operations = [];
    this.merkleLeaves = {};
    this.merkleTrees = {};
    this.merkleNodes = {};
    this.entryMemos = {};
    this.entryNullifiers = {};

    try {
      const hydrated = hydrateWalletState(row?.json?.wallet);
      for (const [k, v] of hydrated.cursors.entries()) this.cursors.set(k, v);
      for (const [k, v] of hydrated.utxos.entries()) this.utxos.set(k, v);

      const ops = row?.json?.operations;
      this.operations = Array.isArray(ops) ? ops : [];

      const merkleLeavesRaw = row?.json?.merkleLeaves;
      if (merkleLeavesRaw && typeof merkleLeavesRaw === 'object') {
        this.merkleLeaves = merkleLeavesRaw;
      }

      const merkleTreesRaw = row?.json?.merkleTrees;
      if (merkleTreesRaw && typeof merkleTreesRaw === 'object') {
        this.merkleTrees = merkleTreesRaw;
      }

      const merkleNodesRaw = row?.json?.merkleNodes;
      if (merkleNodesRaw && typeof merkleNodesRaw === 'object') {
        this.merkleNodes = merkleNodesRaw;
      }

      const entryMemosRaw = row?.json?.entryMemos;
      if (entryMemosRaw && typeof entryMemosRaw === 'object') {
        this.entryMemos = entryMemosRaw;
      }

      const entryNullifiersRaw = row?.json?.entryNullifiers;
      if (entryNullifiersRaw && typeof entryNullifiersRaw === 'object') {
        this.entryNullifiers = entryNullifiersRaw;
      }
    } catch {
      // ignore bad rows
    }

    const pruned = this.pruneOperations();
    if (pruned) void this.save().catch(() => undefined);
  }

  /**
   * Persist current state to IndexedDB (write transaction).
   */
  private async save() {
    this.saveChain = this.saveChain
      .catch(() => undefined)
      .then(async () => {
        const db = await this.openDb();
        const storeName = this.storeName();
        const id = this.stateId();
        const wallet = serializeWalletState({ walletId: this.walletId, cursors: this.cursors, utxos: this.utxos });
        const json: PersistedStoreState = {
          wallet,
          operations: this.operations,
          merkleLeaves: this.merkleLeaves,
          merkleTrees: this.merkleTrees,
          merkleNodes: this.merkleNodes,
          entryMemos: this.entryMemos,
          entryNullifiers: this.entryNullifiers,
        };

        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('indexedDB put failed'));
          const store = tx.objectStore(storeName);
          store.put({ id, json } satisfies StateRow);
        });
      });
    return this.saveChain;
  }

  /**
   * Get a merkle node by id.
   */
  async getMerkleNode(chainId: number, id: string): Promise<MerkleNodeRecord | undefined> {
    const node = this.merkleNodes[String(chainId)]?.[id];
    if (!node) return undefined;
    const hash = node.hash;
    if (typeof hash !== 'string' || !hash.startsWith('0x')) return undefined;
    return { ...node, chainId };
  }

  /**
   * Upsert merkle nodes and persist.
   */
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

  /**
   * Clear merkle nodes for a chain.
   */
  async clearMerkleNodes(chainId: number): Promise<void> {
    delete this.merkleNodes[String(chainId)];
    await this.save();
  }

  /**
   * Get persisted merkle tree metadata for a chain.
   */
  async getMerkleTree(chainId: number): Promise<MerkleTreeState | undefined> {
    const row = this.merkleTrees[String(chainId)];
    if (!row) return undefined;
    const totalElements = Number(row.totalElements);
    const lastUpdated = Number(row.lastUpdated);
    const root = row.root;
    if (typeof root !== 'string' || !root.startsWith('0x')) return undefined;
    if (!Number.isFinite(totalElements) || totalElements < 0) return undefined;
    return { chainId, root, totalElements: Math.floor(totalElements), lastUpdated: Number.isFinite(lastUpdated) ? Math.floor(lastUpdated) : 0 };
  }

  /**
   * Persist merkle tree metadata for a chain.
   */
  async setMerkleTree(chainId: number, tree: MerkleTreeState): Promise<void> {
    this.merkleTrees[String(chainId)] = { ...tree, chainId };
    await this.save();
  }

  /**
   * Clear merkle tree metadata for a chain.
   */
  async clearMerkleTree(chainId: number): Promise<void> {
    delete this.merkleTrees[String(chainId)];
    await this.save();
  }

  /**
   * Upsert entry memos and persist.
   */
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
        const cid = Number(row.cid);
        if (!Number.isFinite(cid) || cid < 0) continue;
        byCid.set(Math.floor(cid), row);
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

  /**
   * List entry memos with query filtering and pagination.
   */
  async listEntryMemos(query: ListEntryMemosQuery): Promise<{ total: number; rows: EntryMemoRecord[] }> {
    const rows = this.entryMemos[String(query.chainId)];
    if (!Array.isArray(rows) || rows.length === 0) return { total: 0, rows: [] };
    const paged = applyEntryMemoQuery(rows, query);
    return { total: paged.total, rows: paged.rows.map((r) => ({ ...r })) };
  }

  /**
   * Clear entry memo cache for a chain.
   */
  async clearEntryMemos(chainId: number): Promise<void> {
    delete this.entryMemos[String(chainId)];
    await this.save();
  }

  /**
   * Upsert entry nullifiers and persist.
   */
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
        const nid = Number(row.nid);
        if (!Number.isFinite(nid) || nid < 0) continue;
        byNid.set(Math.floor(nid), row);
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

  /**
   * List entry nullifiers with query filtering and pagination.
   */
  async listEntryNullifiers(query: ListEntryNullifiersQuery): Promise<{ total: number; rows: EntryNullifierRecord[] }> {
    const rows = this.entryNullifiers[String(query.chainId)];
    if (!Array.isArray(rows) || rows.length === 0) return { total: 0, rows: [] };
    const paged = applyEntryNullifierQuery(rows, query);
    return { total: paged.total, rows: paged.rows.map((r) => ({ ...r })) };
  }

  /**
   * Clear entry nullifier cache for a chain.
   */
  async clearEntryNullifiers(chainId: number): Promise<void> {
    delete this.entryNullifiers[String(chainId)];
    await this.save();
  }

  /**
   * Get persisted merkle leaves for a chain.
   */
  async getMerkleLeaves(chainId: number): Promise<Array<{ cid: number; commitment: Hex }> | undefined> {
    const rows = this.merkleLeaves[String(chainId)];
    if (!Array.isArray(rows) || rows.length === 0) return undefined;
    const out: Array<{ cid: number; commitment: Hex }> = [];
    for (const row of rows) {
      const cid = Number(row?.cid);
      const commitment = row?.commitment;
      if (!Number.isFinite(cid) || cid < 0) continue;
      if (typeof commitment !== 'string' || !commitment.startsWith('0x')) continue;
      out.push({ cid: Math.floor(cid), commitment });
    }
    out.sort((a, b) => a.cid - b.cid);
    return out.length ? out : undefined;
  }

  /**
   * Get a merkle leaf by cid.
   */
  async getMerkleLeaf(chainId: number, cid: number) {
    const rows = await this.getMerkleLeaves(chainId);
    const row = rows?.[cid];
    if (!row) return undefined;
    return { chainId, cid: row.cid, commitment: row.commitment };
  }

  /**
   * Append contiguous merkle leaves and persist.
   */
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

  /**
   * Clear merkle leaves for a chain.
   */
  async clearMerkleLeaves(chainId: number): Promise<void> {
    delete this.merkleLeaves[String(chainId)];
    await this.save();
  }

  /**
   * Get persisted sync cursor for a chain.
   */
  async getSyncCursor(chainId: number): Promise<SyncCursor | undefined> {
    const cursor = this.cursors.get(chainId);
    return cursor ? { ...cursor } : undefined;
  }

  /**
   * Set persisted sync cursor for a chain.
   */
  async setSyncCursor(chainId: number, cursor: SyncCursor): Promise<void> {
    this.cursors.set(chainId, { ...cursor });
    await this.save();
  }

  /**
   * Upsert UTXOs and persist.
   */
  async upsertUtxos(utxos: UtxoRecord[]): Promise<void> {
    for (const utxo of utxos) {
      const key = `${utxo.chainId}:${utxo.commitment}`;
      const prev = this.utxos.get(key);
      this.utxos.set(key, { ...utxo, isSpent: prev?.isSpent ?? utxo.isSpent });
    }
    await this.save();
  }

  /**
   * List UTXOs with query filtering and pagination.
   */
  async listUtxos(query?: ListUtxosQuery): Promise<{ total: number; rows: UtxoRecord[] }> {
    const records = Array.from(this.utxos.values());
    const paged = applyUtxoQuery(records, query);
    return { total: paged.total, rows: paged.rows.map((utxo) => ({ ...utxo })) };
  }

  /**
   * Mark UTXOs as spent by nullifier and persist.
   */
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

  /**
   * Create and persist an operation record.
   */
  createOperation<TType extends OperationType>(
    input: Omit<StoredOperation<OperationDetailFor<TType>>, 'id' | 'createdAt' | 'status'> & Partial<Pick<StoredOperation<OperationDetailFor<TType>>, 'createdAt' | 'id' | 'status'>> & { type: TType },
  ) {
    const created = {
      ...input,
      id: input.id ?? newOperationId(),
      createdAt: input.createdAt ?? Date.now(),
      status: input.status ?? 'created',
    };
    this.operations.unshift(created);
    this.pruneOperations();
    void this.save().catch(() => undefined);
    return created;
  }

  /**
   * Update an operation record and persist.
   */
  updateOperation(id: string, patch: Partial<StoredOperation>) {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return;
    this.operations[idx] = { ...this.operations[idx]!, ...patch };
    void this.save().catch(() => undefined);
  }

  /**
   * Delete an operation record and persist.
   */
  deleteOperation(id: string): boolean {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return false;
    this.operations.splice(idx, 1);
    void this.save().catch(() => undefined);
    return true;
  }

  /**
   * Clear all operations and persist.
   */
  clearOperations(): void {
    this.operations = [];
    void this.save().catch(() => undefined);
  }

  /**
   * Prune operations to a maximum count and persist.
   */
  pruneOperations(options?: { max?: number }): number {
    const limit = Math.max(0, Math.floor(options?.max ?? this.maxOperations));
    const before = this.operations.length;
    this.operations = this.operations.slice(0, limit);
    return before - this.operations.length;
  }

  /**
   * List operations with filtering/pagination.
   */
  listOperations(input?: number | ListOperationsQuery) {
    return applyOperationsQuery(this.operations, input);
  }
}
