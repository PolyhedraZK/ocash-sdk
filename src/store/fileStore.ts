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
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hydrateWalletState, serializeWalletState } from './internal/persistedWalletState';
import type { ListOperationsQuery, OperationDetailFor, OperationType, StoredOperation } from './internal/operationTypes';
import { newOperationId } from './internal/operationTypes';
import type { PersistedSharedState, PersistedStoreState } from './internal/persisted';
import { applyOperationsQuery } from './internal/operationsQuery';
import { applyEntryMemoQuery } from './internal/entryMemoQuery';
import { applyEntryNullifierQuery } from './internal/entryNullifierQuery';
import { applyUtxoQuery } from './internal/utxoQuery';

export type FileStoreOptions = {
  baseDir: string;
  maxOperations?: number;
};

/**
 * JSON-file backed StorageAdapter for Node environments.
 * Persists wallet state and shared merkle/entry cache to disk.
 */
export class FileStore implements StorageAdapter {
  private walletId: string | undefined;
  private readonly cursors = new Map<number, SyncCursor>();
  private readonly utxos = new Map<string, UtxoRecord>();
  private operations: Array<StoredOperation> = [];
  private merkleTrees: Record<string, MerkleTreeState> = {};
  private merkleNodes: Record<string, Record<string, MerkleNodeRecord>> = {};
  private entryMemos: Record<string, EntryMemoRecord[]> = {};
  private entryNullifiers: Record<string, EntryNullifierRecord[]> = {};
  private saveChain: Promise<void> = Promise.resolve();
  private readonly maxOperations: number;
  private readonly merkleNextCid = new Map<number, number>();

  /**
   * Create a FileStore with a base directory and optional limits.
   */
  constructor(private readonly options: FileStoreOptions) {
    const max = options.maxOperations;
    this.maxOperations = max == null ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(max));
  }

  private samePlainRecord(a: Record<string, unknown> | undefined, b: Record<string, unknown>): boolean {
    if (!a) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of bKeys) {
      if (a[key] !== b[key]) return false;
    }
    return true;
  }

  /**
   * Initialize store for a wallet id and load from disk.
   */
  async init(options?: { walletId?: string }) {
    this.walletId = options?.walletId ?? this.walletId;
    await this.load();
  }

  /**
   * Flush pending state to disk.
   */
  async close() {
    await this.saveChain;
  }

  /**
   * Compute the primary JSON state file path for the current wallet id.
   */
  private filePath() {
    const suffix = this.walletId ? this.walletId.replace(/[^a-zA-Z0-9._-]/g, '_') : 'default';
    return path.join(this.options.baseDir, `${suffix}.store.json`);
  }

  /**
   * Compute the shared JSON state file path for chain-level caches.
   */
  private sharedFilePath() {
    return path.join(this.options.baseDir, 'shared.store.json');
  }

  /**
   * Compute the shared merkle leaves jsonl file path for a chain.
   */
  private merkleFilePath(chainId: number) {
    return path.join(this.options.baseDir, `shared.merkle.${chainId}.jsonl`);
  }

  private async readMerkleFile(filePath: string): Promise<Array<{ cid: number; commitment: Hex }> | undefined> {
    try {
      const raw = await readFile(filePath, 'utf8');
      const out: Array<{ cid: number; commitment: Hex }> = [];
      const lines = raw.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          const cid = Number(row?.cid);
          const commitment = row?.commitment as Hex;
          if (!Number.isFinite(cid) || cid < 0) continue;
          if (typeof commitment !== 'string' || !commitment.startsWith('0x')) continue;
          out.push({ cid: Math.floor(cid), commitment });
        } catch {
          // ignore bad lines
        }
      }
      out.sort((a, b) => a.cid - b.cid);
      return out.length ? out : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Infer the next merkle cid from the tail of the jsonl file.
   */
  private async getMerkleNextCid(chainId: number): Promise<number> {
    const cached = this.merkleNextCid.get(chainId);
    if (cached != null) return cached;
    try {
      const raw = await readFile(this.merkleFilePath(chainId), 'utf8');
      const lines = raw.split('\n').filter((l) => l.trim().length > 0);
      if (!lines.length) {
        this.merkleNextCid.set(chainId, 0);
        return 0;
      }
      const last = JSON.parse(lines[lines.length - 1]!);
      const cid = Number(last?.cid);
      const next = Number.isFinite(cid) ? Math.max(0, Math.floor(cid) + 1) : 0;
      this.merkleNextCid.set(chainId, next);
      return next;
    } catch {
      this.merkleNextCid.set(chainId, 0);
      return 0;
    }
  }

  /**
   * Load persisted state from disk into memory.
   */
  private async load() {
    await mkdir(this.options.baseDir, { recursive: true });
    // Reset wallet-local state first; if the file is missing/bad for this wallet, we should not leak data from a previous walletId.
    this.cursors.clear();
    this.utxos.clear();
    this.operations = [];
    this.merkleNextCid.clear();
    this.merkleTrees = {};
    this.merkleNodes = {};
    this.entryMemos = {};
    this.entryNullifiers = {};
    try {
      const raw = await readFile(this.filePath(), 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedStoreState>;
      const hydrated = hydrateWalletState(parsed.wallet);
      for (const [k, v] of hydrated.cursors.entries()) this.cursors.set(k, v);
      for (const [k, v] of hydrated.utxos.entries()) this.utxos.set(k, v);

      const operations = Array.isArray(parsed.operations) ? parsed.operations : [];
      this.operations = operations;
    } catch {
      // ignore missing/bad file
    }

    try {
      const raw = await readFile(this.sharedFilePath(), 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedSharedState>;
      const merkleTreesRaw = parsed.merkleTrees;
      if (merkleTreesRaw && typeof merkleTreesRaw === 'object') {
        this.merkleTrees = merkleTreesRaw;
      }

      const merkleNodesRaw = parsed.merkleNodes;
      if (merkleNodesRaw && typeof merkleNodesRaw === 'object') {
        this.merkleNodes = merkleNodesRaw;
      }

      const entryMemosRaw = parsed.entryMemos;
      if (entryMemosRaw && typeof entryMemosRaw === 'object') {
        this.entryMemos = entryMemosRaw;
      }

      const entryNullifiersRaw = parsed.entryNullifiers;
      if (entryNullifiersRaw && typeof entryNullifiersRaw === 'object') {
        this.entryNullifiers = entryNullifiersRaw;
      }
    } catch {
      // ignore missing/bad shared file
    }

    const pruned = this.pruneOperations();
    if (pruned) void this.saveWallet().catch(() => undefined);
  }

  /**
   * Persist wallet-scoped state to disk using a temp file swap.
   */
  private async saveWallet() {
    this.saveChain = this.saveChain
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.options.baseDir, { recursive: true });
        const wallet = serializeWalletState({ walletId: this.walletId, cursors: this.cursors, utxos: this.utxos });
        const walletState: PersistedStoreState = {
          wallet,
          operations: this.operations,
        };
        const walletTarget = this.filePath();
        const walletTmp = `${walletTarget}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(walletTmp, JSON.stringify(walletState, null, 2), 'utf8');
        await rename(walletTmp, walletTarget);
      });
    return this.saveChain;
  }

  /**
   * Persist shared chain-scoped state to disk using a temp file swap.
   */
  private async saveShared() {
    this.saveChain = this.saveChain
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.options.baseDir, { recursive: true });
        const sharedState: PersistedSharedState = {
          merkleTrees: this.merkleTrees,
          merkleNodes: this.merkleNodes,
          entryMemos: this.entryMemos,
          entryNullifiers: this.entryNullifiers,
        };

        const sharedTarget = this.sharedFilePath();
        const sharedTmp = `${sharedTarget}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(sharedTmp, JSON.stringify(sharedState, null, 2), 'utf8');
        await rename(sharedTmp, sharedTarget);
      });
    return this.saveChain;
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
    await this.saveShared();
  }

  /**
   * Clear merkle tree metadata for a chain.
   */
  async clearMerkleTree(chainId: number): Promise<void> {
    delete this.merkleTrees[String(chainId)];
    await this.saveShared();
  }

  /**
   * Get a merkle node by id.
   */
  async getMerkleNode(chainId: number, id: string): Promise<MerkleNodeRecord | undefined> {
    return this.merkleNodes[String(chainId)]?.[id];
  }

  /**
   * Upsert merkle nodes for a chain and persist.
   */
  async upsertMerkleNodes(chainId: number, nodes: MerkleNodeRecord[]): Promise<void> {
    if (!nodes.length) return;
    const key = String(chainId);
    const existing = this.merkleNodes[key] ?? {};
    for (const node of nodes) {
      existing[node.id] = { ...node, chainId };
    }
    this.merkleNodes[key] = existing;
    await this.saveShared();
  }

  /**
   * Clear merkle nodes for a chain.
   */
  async clearMerkleNodes(chainId: number): Promise<void> {
    delete this.merkleNodes[String(chainId)];
    await this.saveShared();
  }

  /**
   * Upsert entry memos (raw EntryService cache) and persist.
   */
  async upsertEntryMemos(memos: EntryMemoRecord[]): Promise<void> {
    let changed = false;
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
        const next = { ...row };
        const prev = byCid.get(row.cid);
        if (!this.samePlainRecord(prev as Record<string, unknown> | undefined, next as Record<string, unknown>)) {
          changed = true;
          byCid.set(row.cid, next);
        }
      }
      this.entryMemos[key] = Array.from(byCid.values()).sort((a, b) => a.cid - b.cid);
    }
    if (changed) await this.saveShared();
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
    await this.saveShared();
  }

  /**
   * Upsert entry nullifiers (raw EntryService cache) and persist.
   */
  async upsertEntryNullifiers(nullifiers: EntryNullifierRecord[]): Promise<void> {
    let changed = false;
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
        const next = { ...row };
        const prev = byNid.get(row.nid);
        if (!this.samePlainRecord(prev as Record<string, unknown> | undefined, next as Record<string, unknown>)) {
          changed = true;
          byNid.set(row.nid, next);
        }
      }
      this.entryNullifiers[key] = Array.from(byNid.values()).sort((a, b) => a.nid - b.nid);
    }
    if (changed) await this.saveShared();
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
    await this.saveShared();
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
    await this.saveWallet();
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
    await this.saveWallet();
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
    if (updated) await this.saveWallet();
    return updated;
  }

  /**
   * Load merkle leaves from jsonl file.
   */
  async getMerkleLeaves(chainId: number): Promise<Array<{ cid: number; commitment: Hex }> | undefined> {
    const shared = await this.readMerkleFile(this.merkleFilePath(chainId));
    if (shared?.length) return shared;
    return undefined;
  }

  /**
   * Get a merkle leaf by cid (loads full list then indexes).
   */
  async getMerkleLeaf(chainId: number, cid: number) {
    const rows = await this.getMerkleLeaves(chainId);
    const row = rows?.[cid];
    if (!row) return undefined;
    return { chainId, cid: row.cid, commitment: row.commitment };
  }

  /**
   * Append contiguous merkle leaves to jsonl file.
   */
  async appendMerkleLeaves(chainId: number, leaves: Array<{ cid: number; commitment: Hex }>): Promise<void> {
    if (!leaves.length) return;
    const sorted = [...leaves].sort((a, b) => a.cid - b.cid);
    let next = await this.getMerkleNextCid(chainId);
    // Drop already-persisted leaves (e.g. when resyncing from cid=0).
    const fresh = sorted.filter((l) => Number.isFinite(l.cid) && l.cid >= next);
    if (!fresh.length) return;
    if (fresh[0]!.cid !== next) {
      throw new Error(`Non-contiguous merkle leaves append: expected cid=${next}, got cid=${fresh[0]!.cid}`);
    }
    for (let i = 0; i < fresh.length; i++) {
      const cid = fresh[i]!.cid;
      if (cid !== next) throw new Error(`Non-contiguous merkle leaves append: expected cid=${next}, got cid=${cid}`);
      next++;
    }
    await mkdir(this.options.baseDir, { recursive: true });
    const lines = fresh.map((l) => JSON.stringify({ cid: l.cid, commitment: l.commitment })).join('\n') + '\n';
    await appendFile(this.merkleFilePath(chainId), lines, 'utf8');
    this.merkleNextCid.set(chainId, next);
  }

  /**
   * Delete merkle leaves jsonl file for a chain.
   */
  async clearMerkleLeaves(chainId: number): Promise<void> {
    try {
      await unlink(this.merkleFilePath(chainId));
    } catch {
      // ignore
    }
    this.merkleNextCid.set(chainId, 0);
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
    void this.saveWallet().catch(() => undefined);
    return created;
  }

  /**
   * Update an operation record and persist.
   */
  updateOperation(id: string, patch: Partial<StoredOperation>) {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return;
    this.operations[idx] = { ...this.operations[idx]!, ...patch };
    void this.saveWallet().catch(() => undefined);
  }

  /**
   * Delete an operation record and persist.
   */
  deleteOperation(id: string): boolean {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return false;
    this.operations.splice(idx, 1);
    void this.saveWallet().catch(() => undefined);
    return true;
  }

  /**
   * Clear all operations and persist.
   */
  clearOperations(): void {
    this.operations = [];
    void this.saveWallet().catch(() => undefined);
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
