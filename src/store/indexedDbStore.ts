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
import { newOperationId } from './operationTypes';
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

type CursorRow = { walletId: string; chainId: number } & SyncCursor;

type UtxoRow = { walletId: string } & UtxoRecord;

type OperationRow = { walletId: string } & StoredOperation;

type MerkleLeafRow = { chainId: number; cid: number; commitment: Hex };

type StoreDef = {
  name: string;
  keyPath: string | string[];
  indexes?: Array<{ name: string; keyPath: string | string[] }>;
};

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
   * Close the DB connection and clear handle.
   */
  async close() {
    this.db?.close();
    this.db = null;
  }

  /**
   * Resolve base object store name (default: ocash_store).
   */
  private storeName() {
    return this.options.storeName ?? 'ocash_store';
  }

  private walletKey() {
    return this.walletId ?? 'default';
  }

  private storeDefs(): StoreDef[] {
    const base = this.storeName();
    return [
      { name: `${base}:cursors`, keyPath: ['walletId', 'chainId'], indexes: [{ name: 'walletId', keyPath: 'walletId' }] },
      { name: `${base}:utxos`, keyPath: ['walletId', 'chainId', 'commitment'], indexes: [{ name: 'walletId', keyPath: 'walletId' }] },
      { name: `${base}:operations`, keyPath: ['walletId', 'id'], indexes: [{ name: 'walletId', keyPath: 'walletId' }] },
      { name: `${base}:entryMemos`, keyPath: ['chainId', 'cid'], indexes: [{ name: 'chainId', keyPath: 'chainId' }] },
      { name: `${base}:entryNullifiers`, keyPath: ['chainId', 'nid'], indexes: [{ name: 'chainId', keyPath: 'chainId' }] },
      { name: `${base}:merkleLeaves`, keyPath: ['chainId', 'cid'], indexes: [{ name: 'chainId', keyPath: 'chainId' }] },
      { name: `${base}:merkleTrees`, keyPath: 'chainId' },
      { name: `${base}:merkleNodes`, keyPath: ['chainId', 'id'], indexes: [{ name: 'chainId', keyPath: 'chainId' }] },
    ];
  }

  private async openDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    const factory: IDBFactory | undefined = this.options.indexedDb ?? globalThis.indexedDB;
    if (!factory) throw new Error('indexedDB is not available');
    const name = this.options.dbName ?? 'ocash_sdk';
    const defs = this.storeDefs();

    const open = (version?: number) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = version == null ? factory.open(name) : factory.open(name, version);
        req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const def of defs) {
            let store: IDBObjectStore | null = null;
            if (!db.objectStoreNames.contains(def.name)) {
              store = db.createObjectStore(def.name, { keyPath: def.keyPath });
            } else if (req.transaction) {
              store = req.transaction.objectStore(def.name);
            }
            if (store && def.indexes) {
              for (const idx of def.indexes) {
                if (!store.indexNames.contains(idx.name)) {
                  store.createIndex(idx.name, idx.keyPath, { unique: false });
                }
              }
            }
          }
        };
        req.onsuccess = () => resolve(req.result);
      });

    let db = await open();
    const missing = defs.some((def) => !db.objectStoreNames.contains(def.name));
    if (missing) {
      const currentVersion = db.version;
      const nextVersion = typeof currentVersion === 'number' && currentVersion > 0 ? currentVersion + 1 : 2;
      db.close();
      db = await open(nextVersion);
    }

    this.db = db;
    return db;
  }

  private storeNames() {
    const base = this.storeName();
    return {
      cursors: `${base}:cursors`,
      utxos: `${base}:utxos`,
      operations: `${base}:operations`,
      entryMemos: `${base}:entryMemos`,
      entryNullifiers: `${base}:entryNullifiers`,
      merkleLeaves: `${base}:merkleLeaves`,
      merkleTrees: `${base}:merkleTrees`,
      merkleNodes: `${base}:merkleNodes`,
    };
  }

  private async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.openDb();
    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onerror = () => reject(req.error ?? new Error('indexedDB getAll failed'));
      req.onsuccess = () => resolve(req.result as T[]);
    });
  }

  private async getAllByIndex<T>(storeName: string, indexName: string, key: IDBValidKey): Promise<T[]> {
    const db = await this.openDb();
    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = index.getAll(key);
      req.onerror = () => reject(req.error ?? new Error('indexedDB index getAll failed'));
      req.onsuccess = () => resolve(req.result as T[]);
    });
  }

  private async putMany<T>(storeName: string, rows: T[]): Promise<void> {
    if (!rows.length) return;
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB put failed'));
      const store = tx.objectStore(storeName);
      for (const row of rows) store.put(row as T);
    });
  }

  private async deleteByKeys(storeName: string, keys: IDBValidKey[]): Promise<void> {
    if (!keys.length) return;
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB delete failed'));
      const store = tx.objectStore(storeName);
      for (const key of keys) store.delete(key);
    });
  }

  private async deleteAllByIndex(storeName: string, indexName: string, key: IDBValidKey): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB deleteByIndex failed'));
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = index.openCursor(IDBKeyRange.only(key));
      req.onerror = () => reject(req.error ?? new Error('indexedDB cursor failed'));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    });
  }

  /**
   * Load persisted state into memory and normalize it.
   */
  private async load() {
    const stores = this.storeNames();
    const walletKey = this.walletKey();

    // Reset local state first; if the remote has no/invalid state for this wallet, we should not leak old data.
    this.cursors.clear();
    this.utxos.clear();
    this.operations = [];
    this.merkleLeaves = {};
    this.merkleTrees = {};
    this.merkleNodes = {};
    this.entryMemos = {};
    this.entryNullifiers = {};

    const cursorRows = await this.getAllByIndex<CursorRow>(stores.cursors, 'walletId', walletKey);
    for (const row of cursorRows) {
      this.cursors.set(row.chainId, { memo: row.memo, nullifier: row.nullifier, merkle: row.merkle });
    }

    const utxoRows = await this.getAllByIndex<UtxoRow>(stores.utxos, 'walletId', walletKey);
    for (const row of utxoRows) {
      const { walletId: _walletId, ...utxo } = row;
      const key = `${utxo.chainId}:${utxo.commitment}`;
      this.utxos.set(key, { ...utxo });
    }

    const operationRows = await this.getAllByIndex<OperationRow>(stores.operations, 'walletId', walletKey);
    this.operations = operationRows
      .map((row) => {
        const { walletId: _walletId, ...operation } = row;
        return operation;
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    const memoRows = await this.getAll<EntryMemoRecord>(stores.entryMemos);
    for (const row of memoRows) {
      const key = String(row.chainId);
      const existing = this.entryMemos[key] ?? [];
      existing.push({ ...row });
      this.entryMemos[key] = existing;
    }
    for (const [key, list] of Object.entries(this.entryMemos)) {
      this.entryMemos[key] = list.sort((a, b) => a.cid - b.cid);
    }

    const nullifierRows = await this.getAll<EntryNullifierRecord>(stores.entryNullifiers);
    for (const row of nullifierRows) {
      const key = String(row.chainId);
      const existing = this.entryNullifiers[key] ?? [];
      existing.push({ ...row });
      this.entryNullifiers[key] = existing;
    }
    for (const [key, list] of Object.entries(this.entryNullifiers)) {
      this.entryNullifiers[key] = list.sort((a, b) => a.nid - b.nid);
    }

    const leafRows = await this.getAll<MerkleLeafRow>(stores.merkleLeaves);
    for (const row of leafRows) {
      const key = String(row.chainId);
      const existing = this.merkleLeaves[key] ?? [];
      existing.push({ cid: row.cid, commitment: row.commitment });
      this.merkleLeaves[key] = existing;
    }
    for (const [key, list] of Object.entries(this.merkleLeaves)) {
      this.merkleLeaves[key] = list.sort((a, b) => a.cid - b.cid);
    }

    const treeRows = await this.getAll<MerkleTreeState>(stores.merkleTrees);
    for (const row of treeRows) {
      this.merkleTrees[String(row.chainId)] = { ...row };
    }

    const nodeRows = await this.getAll<MerkleNodeRecord>(stores.merkleNodes);
    for (const row of nodeRows) {
      const key = String(row.chainId);
      const existing = this.merkleNodes[key] ?? {};
      existing[row.id] = { ...row };
      this.merkleNodes[key] = existing;
    }

    this.pruneOperations();
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

    const rows = nodes.map((node) => ({ ...node, chainId }));
    await this.putMany(this.storeNames().merkleNodes, rows);
  }

  /**
   * Clear merkle nodes for a chain.
   */
  async clearMerkleNodes(chainId: number): Promise<void> {
    delete this.merkleNodes[String(chainId)];
    await this.deleteAllByIndex(this.storeNames().merkleNodes, 'chainId', chainId);
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
    await this.putMany(this.storeNames().merkleTrees, [{ ...tree, chainId }]);
  }

  /**
   * Clear merkle tree metadata for a chain.
   */
  async clearMerkleTree(chainId: number): Promise<void> {
    delete this.merkleTrees[String(chainId)];
    await this.deleteByKeys(this.storeNames().merkleTrees, [chainId]);
  }

  /**
   * Upsert entry memos and persist.
   */
  async upsertEntryMemos(memos: EntryMemoRecord[]): Promise<number> {
    let updated = 0;
    const grouped = new Map<number, EntryMemoRecord[]>();
    const toPersist: EntryMemoRecord[] = [];
    for (const memo of memos) {
      if (!Number.isInteger(memo.cid) || memo.cid < 0) continue;
      const list = grouped.get(memo.chainId) ?? [];
      list.push(memo);
      grouped.set(memo.chainId, list);
      toPersist.push({ ...memo });
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
    if (toPersist.length) await this.putMany(this.storeNames().entryMemos, toPersist);
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
    await this.deleteAllByIndex(this.storeNames().entryMemos, 'chainId', chainId);
  }

  /**
   * Upsert entry nullifiers and persist.
   */
  async upsertEntryNullifiers(nullifiers: EntryNullifierRecord[]): Promise<number> {
    let updated = 0;
    const grouped = new Map<number, EntryNullifierRecord[]>();
    const toPersist: EntryNullifierRecord[] = [];
    for (const row of nullifiers) {
      const list = grouped.get(row.chainId) ?? [];
      list.push(row);
      grouped.set(row.chainId, list);
      toPersist.push({ ...row });
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
    if (toPersist.length) await this.putMany(this.storeNames().entryNullifiers, toPersist);
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
    await this.deleteAllByIndex(this.storeNames().entryNullifiers, 'chainId', chainId);
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
    await this.putMany(this.storeNames().merkleLeaves, fresh.map((row) => ({ ...row, chainId })));
  }

  /**
   * Clear merkle leaves for a chain.
   */
  async clearMerkleLeaves(chainId: number): Promise<void> {
    delete this.merkleLeaves[String(chainId)];
    await this.deleteAllByIndex(this.storeNames().merkleLeaves, 'chainId', chainId);
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
    await this.putMany(this.storeNames().cursors, [{ walletId: this.walletKey(), chainId, ...cursor }]);
  }

  /**
   * Upsert UTXOs and persist.
   */
  async upsertUtxos(utxos: UtxoRecord[]): Promise<void> {
    const rows: UtxoRow[] = [];
    for (const utxo of utxos) {
      const key = `${utxo.chainId}:${utxo.commitment}`;
      const prev = this.utxos.get(key);
      const merged = { ...utxo, isSpent: prev?.isSpent ?? utxo.isSpent };
      this.utxos.set(key, merged);
      rows.push({ walletId: this.walletKey(), ...merged });
    }
    await this.putMany(this.storeNames().utxos, rows);
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
    const rows: UtxoRow[] = [];
    for (const [key, utxo] of this.utxos.entries()) {
      if (utxo.chainId !== input.chainId) continue;
      if (!wanted.has(utxo.nullifier.toLowerCase())) continue;
      if (!utxo.isSpent) {
        const merged = { ...utxo, isSpent: true };
        this.utxos.set(key, merged);
        rows.push({ walletId: this.walletKey(), ...merged });
        updated++;
      }
    }
    if (rows.length) await this.putMany(this.storeNames().utxos, rows);
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
    void this.putMany(this.storeNames().operations, [{ walletId: this.walletKey(), ...created }]);
    return created;
  }

  /**
   * Update an operation record and persist.
   */
  updateOperation(id: string, patch: Partial<StoredOperation>) {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return;
    this.operations[idx] = { ...this.operations[idx]!, ...patch };
    const updated = this.operations[idx]!;
    void this.putMany(this.storeNames().operations, [{ walletId: this.walletKey(), ...updated }]);
  }

  /**
   * Delete an operation record and persist.
   */
  deleteOperation(id: string): boolean {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return false;
    this.operations.splice(idx, 1);
    void this.deleteByKeys(this.storeNames().operations, [[this.walletKey(), id]]);
    return true;
  }

  /**
   * Clear all operations and persist.
   */
  clearOperations(): void {
    this.operations = [];
    void this.deleteAllByIndex(this.storeNames().operations, 'walletId', this.walletKey());
  }

  /**
   * Prune operations to a maximum count and persist.
   */
  pruneOperations(options?: { max?: number }): number {
    const limit = Math.max(0, Math.floor(options?.max ?? this.maxOperations));
    const before = this.operations.length;
    const removed = this.operations.slice(limit);
    this.operations = this.operations.slice(0, limit);
    if (removed.length) {
      const keys = removed.map((op) => [this.walletKey(), op.id] as IDBValidKey);
      void this.deleteByKeys(this.storeNames().operations, keys);
    }
    return before - this.operations.length;
  }

  /**
   * List operations with filtering/pagination.
   */
  listOperations(input?: number | ListOperationsQuery) {
    return applyOperationsQuery(this.operations, input);
  }
}
