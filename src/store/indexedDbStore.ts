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
import type { ListOperationsQuery, OperationDetailFor, OperationType, StoredOperation } from './internal/operationTypes';
import { newOperationId } from './internal/operationTypes';
import { applyOperationsQuery } from './internal/operationsQuery';
import { applyEntryMemoQuery } from './internal/entryMemoQuery';
import { applyEntryNullifierQuery } from './internal/entryNullifierQuery';
import { applyUtxoQuery } from './internal/utxoQuery';

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
  private static readonly DB_VERSION = 2;
  private walletId: string | undefined;
  private readonly cursors = new Map<number, SyncCursor>();
  private operations: Array<StoredOperation> = [];
  private merkleTrees: Record<string, MerkleTreeState> = {};
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
      {
        name: `${base}:utxos`,
        keyPath: ['walletId', 'chainId', 'commitment'],
        indexes: [
          { name: 'walletId', keyPath: 'walletId' },
          { name: 'walletChain', keyPath: ['walletId', 'chainId'] },
        ],
      },
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
    const name = this.options.dbName ?? 'ocash_sdk_v2';
    const defs = this.storeDefs();

    const open = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = factory.open(name, IndexedDbStore.DB_VERSION);
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

    const db = await open();
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
      if (typeof store.openCursor !== 'function') {
        const req = store.getAll();
        req.onerror = () => reject(req.error ?? new Error('indexedDB getAll failed'));
        req.onsuccess = () => resolve(req.result as T[]);
        return;
      }
      const rows: T[] = [];
      const req = store.openCursor();
      req.onerror = () => reject(req.error ?? new Error('indexedDB cursor getAll failed'));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(rows);
          return;
        }
        rows.push(cursor.value as T);
        cursor.continue();
      };
    });
  }

  private async getAllByIndex<T>(storeName: string, indexName: string, key: IDBValidKey): Promise<T[]> {
    const db = await this.openDb();
    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      if (!store.indexNames.contains(indexName)) {
        reject(new Error(`indexedDB index ${indexName} not found on ${storeName}`));
        return;
      }
      const index = store.index(indexName);
      const keyRange = IDBKeyRange.only(key);
      const rows: T[] = [];
      if (typeof index.openCursor !== 'function') {
        const req = index.getAll(key);
        req.onerror = () => reject(req.error ?? new Error('indexedDB index getAll failed'));
        req.onsuccess = () => resolve(req.result as T[]);
        return;
      }
      const req = index.openCursor(keyRange);
      req.onerror = () => reject(req.error ?? new Error('indexedDB index cursor getAll failed'));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(rows);
          return;
        }
        rows.push(cursor.value as T);
        cursor.continue();
      };
    });
  }

  private async getByKey<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const db = await this.openDb();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onerror = () => reject(req.error ?? new Error('indexedDB get failed'));
      req.onsuccess = () => resolve((req.result as T | undefined) ?? undefined);
    });
  }

  private async getByKeys<T>(storeName: string, keys: IDBValidKey[]): Promise<Array<T | undefined>> {
    if (!keys.length) return [];
    const db = await this.openDb();
    return new Promise<Array<T | undefined>>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const out: Array<T | undefined> = new Array(keys.length);
      let done = 0;
      keys.forEach((key, index) => {
        const req = store.get(key);
        req.onerror = () => reject(req.error ?? new Error('indexedDB multi-get failed'));
        req.onsuccess = () => {
          out[index] = (req.result as T | undefined) ?? undefined;
          done += 1;
          if (done === keys.length) resolve(out);
        };
      });
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
    this.operations = [];
    this.merkleTrees = {};

    const cursorRows = await this.getAllByIndex<CursorRow>(stores.cursors, 'walletId', walletKey);
    for (const row of cursorRows) {
      this.cursors.set(row.chainId, { memo: row.memo, nullifier: row.nullifier, merkle: row.merkle });
    }

    const operationRows = await this.getAllByIndex<OperationRow>(stores.operations, 'walletId', walletKey);
    this.operations = operationRows
      .map((row) => {
        const { walletId: _walletId, ...operation } = row;
        return operation;
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    const treeRows = await this.getAll<MerkleTreeState>(stores.merkleTrees);
    for (const row of treeRows) {
      this.merkleTrees[String(row.chainId)] = { ...row };
    }

    this.pruneOperations();
  }

  /**
   * Get a merkle node by id.
   */
  async getMerkleNode(chainId: number, id: string): Promise<MerkleNodeRecord | undefined> {
    const node = await this.getByKey<MerkleNodeRecord>(this.storeNames().merkleNodes, [chainId, id]);
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
    const rows = nodes.map((node) => ({ ...node, chainId }));
    await this.putMany(this.storeNames().merkleNodes, rows);
  }

  /**
   * Clear merkle nodes for a chain.
   */
  async clearMerkleNodes(chainId: number): Promise<void> {
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
  async upsertEntryMemos(memos: EntryMemoRecord[]): Promise<void> {
    const dedup = new Map<string, EntryMemoRecord>();
    for (const memo of memos) {
      if (!Number.isInteger(memo.cid) || memo.cid < 0) continue;
      dedup.set(`${memo.chainId}:${memo.cid}`, { ...memo });
    }
    const toPersist = Array.from(dedup.values());
    if (toPersist.length) await this.putMany(this.storeNames().entryMemos, toPersist);
  }

  /**
   * List entry memos with query filtering and pagination.
   */
  async listEntryMemos(query: ListEntryMemosQuery): Promise<{ total: number; rows: EntryMemoRecord[] }> {
    const rows = await this.getAllByIndex<EntryMemoRecord>(this.storeNames().entryMemos, 'chainId', query.chainId);
    if (!Array.isArray(rows) || rows.length === 0) return { total: 0, rows: [] };
    const paged = applyEntryMemoQuery(rows, query);
    return { total: paged.total, rows: paged.rows.map((r) => ({ ...r })) };
  }

  /**
   * Clear entry memo cache for a chain.
   */
  async clearEntryMemos(chainId: number): Promise<void> {
    await this.deleteAllByIndex(this.storeNames().entryMemos, 'chainId', chainId);
  }

  /**
   * Upsert entry nullifiers and persist.
   */
  async upsertEntryNullifiers(nullifiers: EntryNullifierRecord[]): Promise<void> {
    const dedup = new Map<string, EntryNullifierRecord>();
    for (const row of nullifiers) {
      if (!Number.isInteger(row.nid) || row.nid < 0) continue;
      dedup.set(`${row.chainId}:${row.nid}`, { ...row });
    }
    const toPersist = Array.from(dedup.values());
    if (toPersist.length) await this.putMany(this.storeNames().entryNullifiers, toPersist);
  }

  /**
   * List entry nullifiers with query filtering and pagination.
   */
  async listEntryNullifiers(query: ListEntryNullifiersQuery): Promise<{ total: number; rows: EntryNullifierRecord[] }> {
    const rows = await this.getAllByIndex<EntryNullifierRecord>(this.storeNames().entryNullifiers, 'chainId', query.chainId);
    if (!Array.isArray(rows) || rows.length === 0) return { total: 0, rows: [] };
    const paged = applyEntryNullifierQuery(rows, query);
    return { total: paged.total, rows: paged.rows.map((r) => ({ ...r })) };
  }

  /**
   * Clear entry nullifier cache for a chain.
   */
  async clearEntryNullifiers(chainId: number): Promise<void> {
    await this.deleteAllByIndex(this.storeNames().entryNullifiers, 'chainId', chainId);
  }

  /**
   * Get persisted merkle leaves for a chain.
   */
  async getMerkleLeaves(chainId: number): Promise<Array<{ cid: number; commitment: Hex }> | undefined> {
    const rows = await this.getAllByIndex<MerkleLeafRow>(this.storeNames().merkleLeaves, 'chainId', chainId);
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
    const row = await this.getByKey<MerkleLeafRow>(this.storeNames().merkleLeaves, [chainId, cid]);
    if (!row) return undefined;
    return { chainId, cid: row.cid, commitment: row.commitment };
  }

  /**
   * Append contiguous merkle leaves and persist.
   */
  async appendMerkleLeaves(chainId: number, leaves: Array<{ cid: number; commitment: Hex }>): Promise<void> {
    if (!leaves.length) return;
    const existing = (await this.getMerkleLeaves(chainId)) ?? [];
    const sorted = [...leaves].sort((a, b) => a.cid - b.cid);
    let next = existing.length;
    const fresh = sorted.filter((l) => Number.isFinite(l.cid) && l.cid >= next);
    if (!fresh.length) {
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
    await this.putMany(
      this.storeNames().merkleLeaves,
      fresh.map((row) => ({ ...row, chainId })),
    );
  }

  /**
   * Clear merkle leaves for a chain.
   */
  async clearMerkleLeaves(chainId: number): Promise<void> {
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
    if (!utxos.length) return;
    const stores = this.storeNames();
    const walletId = this.walletKey();
    const keys = utxos.map((utxo) => [walletId, utxo.chainId, utxo.commitment] as IDBValidKey);
    const existingRows = await this.getByKeys<UtxoRow>(stores.utxos, keys);
    const rows: UtxoRow[] = [];
    for (let i = 0; i < utxos.length; i++) {
      const utxo = utxos[i]!;
      const prev = existingRows[i];
      const merged = { ...utxo, isSpent: prev?.isSpent ?? utxo.isSpent };
      rows.push({ walletId, ...merged });
    }
    await this.putMany(stores.utxos, rows);
  }

  /**
   * List UTXOs with query filtering and pagination.
   */
  async listUtxos(query?: ListUtxosQuery): Promise<{ total: number; rows: UtxoRecord[] }> {
    const stores = this.storeNames();
    const walletId = this.walletKey();
    const rows =
      query?.chainId == null
        ? await this.getAllByIndex<UtxoRow>(stores.utxos, 'walletId', walletId)
        : await this.getAllByIndex<UtxoRow>(stores.utxos, 'walletChain', [walletId, query.chainId]);
    const records: UtxoRecord[] = rows.map((row) => {
      const { walletId: _walletId, ...utxo } = row;
      return { ...utxo };
    });
    const paged = applyUtxoQuery(records, query);
    return { total: paged.total, rows: paged.rows.map((utxo) => ({ ...utxo })) };
  }

  /**
   * Mark UTXOs as spent by nullifier and persist.
   */
  async markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<number> {
    if (!input.nullifiers.length) return 0;
    const stores = this.storeNames();
    const walletId = this.walletKey();
    const allRows = await this.getAllByIndex<UtxoRow>(stores.utxos, 'walletChain', [walletId, input.chainId]);
    const wanted = new Set(input.nullifiers.map((nf) => nf.toLowerCase()));
    let updated = 0;
    const rows: UtxoRow[] = [];
    for (const row of allRows) {
      const { walletId: _walletId, ...utxo } = row;
      if (utxo.chainId !== input.chainId) continue;
      if (!wanted.has(utxo.nullifier.toLowerCase())) continue;
      if (!utxo.isSpent) {
        const merged = { ...utxo, isSpent: true };
        rows.push({ walletId, ...merged });
        updated++;
      }
    }
    if (rows.length) await this.putMany(stores.utxos, rows);
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
