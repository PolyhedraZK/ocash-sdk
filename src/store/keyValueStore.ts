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

export type KeyValueStoreOptions = {
  client: KeyValueClient;
  keyPrefix?: string;
  maxOperations?: number;
};

type PersistedUtxoRecord = Omit<UtxoRecord, 'amount'> & { amount: string };

/**
 * Generic key-value backed StorageAdapter for Redis/SQLite/etc.
 */
export class KeyValueStore implements StorageAdapter {
  private walletId: string | undefined;
  private cursorChains = new Set<number>();
  private utxoRefs = new Set<string>();
  private operationIds: string[] = [];
  private operations: Array<StoredOperation> = [];
  private readonly cursorCache = new Map<number, SyncCursor | undefined>();
  private readonly utxoCache = new Map<string, UtxoRecord | undefined>();
  private readonly operationCache = new Map<string, StoredOperation | undefined>();

  private merkleLeafCids: Record<string, Set<number>> = {};
  private merkleTrees: Record<string, MerkleTreeState> = {};
  private merkleNodeIds: Record<string, Set<string>> = {};
  private entryMemoCids: Record<string, Set<number>> = {};
  private entryNullifierNids: Record<string, Set<number>> = {};

  private readonly loadedMerkleLeaves = new Set<number>();
  private readonly loadedMerkleTrees = new Set<number>();
  private readonly loadedMerkleNodes = new Set<number>();
  private readonly loadedEntryMemos = new Set<number>();
  private readonly loadedEntryNullifiers = new Set<number>();

  private saveChain: Promise<void> = Promise.resolve();
  private readonly maxOperations: number;
  private walletMetaLoaded = false;

  constructor(private readonly options: KeyValueStoreOptions) {
    const max = options.maxOperations;
    this.maxOperations = max == null ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(max));
  }

  async init(options?: { walletId?: string }) {
    this.walletId = options?.walletId ?? this.walletId;
    await this.load();
  }

  async close() {
    await this.saveChain;
  }

  private keyPrefix() {
    return this.options.keyPrefix ?? 'ocash:sdk:store';
  }

  private walletBaseKey() {
    const id = this.walletId ?? 'default';
    return `${this.keyPrefix()}:${id}:wallet`;
  }

  private walletMetaKey(part: 'cursorChains' | 'utxoRefs' | 'operationIds') {
    return `${this.walletBaseKey()}:meta:${part}`;
  }

  private walletCursorKey(chainId: number) {
    return `${this.walletBaseKey()}:cursor:${chainId}`;
  }

  private walletUtxoKey(ref: string) {
    return `${this.walletBaseKey()}:utxo:${ref}`;
  }

  private walletOperationKey(id: string) {
    return `${this.walletBaseKey()}:operation:${id}`;
  }

  private sharedChainKey(part: 'merkleTrees', chainId: number) {
    return `${this.keyPrefix()}:shared:${part}:${chainId}`;
  }

  private sharedChainMetaKey(part: 'merkleLeaves' | 'merkleNodes' | 'entryMemos' | 'entryNullifiers', chainId: number) {
    return `${this.keyPrefix()}:shared:${part}:${chainId}:meta`;
  }

  private sharedRecordKey(part: 'merkleLeaves' | 'merkleNodes' | 'entryMemos' | 'entryNullifiers', chainId: number, id: number | string) {
    return `${this.keyPrefix()}:shared:${part}:${chainId}:${id}`;
  }

  private parseJson<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private parseNumberIndex(raw: string | null): number[] {
    const parsed = this.parseJson<unknown>(raw, []);
    if (!Array.isArray(parsed)) return [];
    const out: number[] = [];
    for (const value of parsed) {
      const num = Number(value);
      if (Number.isInteger(num) && num >= 0) out.push(num);
    }
    out.sort((a, b) => a - b);
    return Array.from(new Set(out));
  }

  private parseStringIndex(raw: string | null): string[] {
    const parsed = this.parseJson<unknown>(raw, []);
    if (!Array.isArray(parsed)) return [];
    const out = parsed.filter((value): value is string => typeof value === 'string');
    return Array.from(new Set(out));
  }

  private toPersistedUtxo(utxo: UtxoRecord): PersistedUtxoRecord {
    return { ...utxo, amount: utxo.amount.toString() };
  }

  private fromPersistedUtxo(raw: PersistedUtxoRecord | null): UtxoRecord | undefined {
    if (!raw) return undefined;
    try {
      return { ...raw, amount: BigInt(raw.amount) };
    } catch {
      return undefined;
    }
  }

  private resetInMemory() {
    this.cursorChains = new Set<number>();
    this.utxoRefs = new Set<string>();
    this.operationIds = [];
    this.operations = [];
    this.cursorCache.clear();
    this.utxoCache.clear();
    this.operationCache.clear();
    this.walletMetaLoaded = false;

    this.merkleLeafCids = {};
    this.merkleTrees = {};
    this.merkleNodeIds = {};
    this.entryMemoCids = {};
    this.entryNullifierNids = {};

    this.loadedMerkleLeaves.clear();
    this.loadedMerkleTrees.clear();
    this.loadedMerkleNodes.clear();
    this.loadedEntryMemos.clear();
    this.loadedEntryNullifiers.clear();
  }

  private enqueueWrite(task: () => Promise<void>) {
    this.saveChain = this.saveChain
      .catch(() => undefined)
      .then(task);
    return this.saveChain;
  }

  private async writeJson(key: string, value: unknown) {
    await this.options.client.set(key, JSON.stringify(value));
  }

  private async deleteOrReset(key: string, fallbackValue: unknown) {
    if (this.options.client.del) {
      await this.options.client.del(key);
      return;
    }
    await this.writeJson(key, fallbackValue);
  }

  private async load() {
    this.resetInMemory();
    await this.ensureWalletMetaLoaded();
    if (this.operationIds.length) {
      const rows = await Promise.all(this.operationIds.map((id) => this.options.client.get(this.walletOperationKey(id))));
      const loaded: StoredOperation[] = [];
      for (let i = 0; i < this.operationIds.length; i++) {
        const operation = this.parseJson<StoredOperation | null>(rows[i] ?? null, null);
        if (!operation) continue;
        loaded.push(operation);
        this.operationCache.set(operation.id, operation);
      }
      this.operations = loaded;
    }
    const removed = this.pruneOperationIds();
    if (!removed.length) return;
    void this.enqueueWrite(async () => {
      await Promise.all(removed.map((id) => this.deleteOrReset(this.walletOperationKey(id), null)));
      await this.writeJson(this.walletMetaKey('operationIds'), this.operationIds);
    }).catch(() => undefined);
  }

  private async ensureWalletMetaLoaded() {
    if (this.walletMetaLoaded) return;
    const [cursorChainsRaw, utxoRefsRaw, operationIdsRaw] = await Promise.all([
      this.options.client.get(this.walletMetaKey('cursorChains')),
      this.options.client.get(this.walletMetaKey('utxoRefs')),
      this.options.client.get(this.walletMetaKey('operationIds')),
    ]);
    this.cursorChains = new Set(this.parseNumberIndex(cursorChainsRaw));
    this.utxoRefs = new Set(this.parseStringIndex(utxoRefsRaw));
    this.operationIds = this.parseStringIndex(operationIdsRaw);
    this.walletMetaLoaded = true;
  }

  private normalizeCursor(cursor: SyncCursor | null): SyncCursor | undefined {
    if (!cursor) return undefined;
    const memo = Number(cursor.memo);
    const nullifier = Number(cursor.nullifier);
    const merkle = Number(cursor.merkle);
    return {
      memo: Number.isFinite(memo) ? memo : 0,
      nullifier: Number.isFinite(nullifier) ? nullifier : 0,
      merkle: Number.isFinite(merkle) ? merkle : 0,
    };
  }

  private async readCursor(chainId: number): Promise<SyncCursor | undefined> {
    if (this.cursorCache.has(chainId)) return this.cursorCache.get(chainId);
    if (!this.cursorChains.has(chainId)) return undefined;
    const raw = await this.options.client.get(this.walletCursorKey(chainId));
    const cursor = this.normalizeCursor(this.parseJson<SyncCursor | null>(raw, null));
    this.cursorCache.set(chainId, cursor);
    return cursor;
  }

  private async readUtxo(ref: string): Promise<UtxoRecord | undefined> {
    if (this.utxoCache.has(ref)) return this.utxoCache.get(ref);
    if (!this.utxoRefs.has(ref)) return undefined;
    const raw = await this.options.client.get(this.walletUtxoKey(ref));
    const utxo = this.fromPersistedUtxo(this.parseJson<PersistedUtxoRecord | null>(raw, null));
    this.utxoCache.set(ref, utxo);
    return utxo;
  }

  private pruneOperationIds(options?: { max?: number }): string[] {
    const limit = Math.max(0, Math.floor(options?.max ?? this.maxOperations));
    if (this.operationIds.length <= limit) return [];
    const removed = this.operationIds.slice(limit);
    this.operationIds = this.operationIds.slice(0, limit);
    const kept = new Set(this.operationIds);
    this.operations = this.operations.filter((op) => kept.has(op.id));
    for (const id of removed) this.operationCache.delete(id);
    return removed;
  }

  private async ensureMerkleLeavesLoaded(chainId: number) {
    if (this.loadedMerkleLeaves.has(chainId)) return;
    const key = String(chainId);
    const cidsRaw = await this.options.client.get(this.sharedChainMetaKey('merkleLeaves', chainId));
    this.merkleLeafCids[key] = new Set(this.parseNumberIndex(cidsRaw));
    this.loadedMerkleLeaves.add(chainId);
  }

  private async ensureMerkleTreeLoaded(chainId: number) {
    if (this.loadedMerkleTrees.has(chainId)) return;
    const key = String(chainId);
    const raw = await this.options.client.get(this.sharedChainKey('merkleTrees', chainId));
    const row = this.parseJson<MerkleTreeState | null>(raw, null);
    if (row && typeof row === 'object') this.merkleTrees[key] = row;
    this.loadedMerkleTrees.add(chainId);
  }

  private async ensureMerkleNodesLoaded(chainId: number) {
    if (this.loadedMerkleNodes.has(chainId)) return;
    const key = String(chainId);
    const idsRaw = await this.options.client.get(this.sharedChainMetaKey('merkleNodes', chainId));
    this.merkleNodeIds[key] = new Set(this.parseStringIndex(idsRaw));
    this.loadedMerkleNodes.add(chainId);
  }

  private async ensureEntryMemosLoaded(chainId: number) {
    if (this.loadedEntryMemos.has(chainId)) return;
    const key = String(chainId);
    const cidsRaw = await this.options.client.get(this.sharedChainMetaKey('entryMemos', chainId));
    this.entryMemoCids[key] = new Set(this.parseNumberIndex(cidsRaw));
    this.loadedEntryMemos.add(chainId);
  }

  private async ensureEntryNullifiersLoaded(chainId: number) {
    if (this.loadedEntryNullifiers.has(chainId)) return;
    const key = String(chainId);
    const nidsRaw = await this.options.client.get(this.sharedChainMetaKey('entryNullifiers', chainId));
    this.entryNullifierNids[key] = new Set(this.parseNumberIndex(nidsRaw));
    this.loadedEntryNullifiers.add(chainId);
  }

  async getMerkleNode(chainId: number, id: string): Promise<MerkleNodeRecord | undefined> {
    await this.ensureMerkleNodesLoaded(chainId);
    if (!this.merkleNodeIds[String(chainId)]?.has(id)) return undefined;
    const raw = await this.options.client.get(this.sharedRecordKey('merkleNodes', chainId, id));
    const node = this.parseJson<MerkleNodeRecord | null>(raw, null);
    if (!node) return undefined;
    const hash = node.hash;
    if (typeof hash !== 'string' || !hash.startsWith('0x')) return undefined;
    return { ...node, chainId };
  }

  async upsertMerkleNodes(chainId: number, nodes: MerkleNodeRecord[]): Promise<void> {
    if (!nodes.length) return;
    await this.ensureMerkleNodesLoaded(chainId);
    const key = String(chainId);
    const ids = this.merkleNodeIds[key] ?? new Set<string>();
    const beforeSize = ids.size;
    for (const node of nodes) {
      ids.add(node.id);
    }
    this.merkleNodeIds[key] = ids;

    await this.enqueueWrite(async () => {
      await Promise.all(nodes.map((node) => this.writeJson(this.sharedRecordKey('merkleNodes', chainId, node.id), { ...node, chainId })));
      if (ids.size !== beforeSize) {
        await this.writeJson(this.sharedChainMetaKey('merkleNodes', chainId), Array.from(ids));
      }
    });
  }

  async clearMerkleNodes(chainId: number): Promise<void> {
    await this.ensureMerkleNodesLoaded(chainId);
    const ids = Array.from(this.merkleNodeIds[String(chainId)] ?? []);
    delete this.merkleNodeIds[String(chainId)];
    await this.enqueueWrite(async () => {
      await Promise.all(ids.map((id) => this.deleteOrReset(this.sharedRecordKey('merkleNodes', chainId, id), null)));
      await this.deleteOrReset(this.sharedChainMetaKey('merkleNodes', chainId), []);
    });
  }

  async getMerkleTree(chainId: number): Promise<MerkleTreeState | undefined> {
    await this.ensureMerkleTreeLoaded(chainId);
    const row = this.merkleTrees[String(chainId)];
    if (!row) return undefined;
    const totalElements = Number(row.totalElements);
    const lastUpdated = Number(row.lastUpdated);
    const root = row.root;
    if (typeof root !== 'string' || !root.startsWith('0x')) return undefined;
    if (!Number.isFinite(totalElements) || totalElements < 0) return undefined;
    return { chainId, root, totalElements: Math.floor(totalElements), lastUpdated: Number.isFinite(lastUpdated) ? Math.floor(lastUpdated) : 0 };
  }

  async setMerkleTree(chainId: number, tree: MerkleTreeState): Promise<void> {
    await this.ensureMerkleTreeLoaded(chainId);
    const row = { ...tree, chainId };
    this.merkleTrees[String(chainId)] = row;
    await this.enqueueWrite(() => this.writeJson(this.sharedChainKey('merkleTrees', chainId), row));
  }

  async clearMerkleTree(chainId: number): Promise<void> {
    await this.ensureMerkleTreeLoaded(chainId);
    delete this.merkleTrees[String(chainId)];
    await this.enqueueWrite(async () => {
      await this.deleteOrReset(this.sharedChainKey('merkleTrees', chainId), null);
    });
  }

  async upsertEntryMemos(memos: EntryMemoRecord[]): Promise<void> {
    const grouped = new Map<number, EntryMemoRecord[]>();
    for (const memo of memos) {
      if (!Number.isInteger(memo.cid) || memo.cid < 0) continue;
      const list = grouped.get(memo.chainId) ?? [];
      list.push(memo);
      grouped.set(memo.chainId, list);
    }
    for (const [chainId, list] of grouped.entries()) {
      await this.ensureEntryMemosLoaded(chainId);
      const key = String(chainId);
      const cids = this.entryMemoCids[key] ?? new Set<number>();
      const beforeSize = cids.size;
      for (const row of list) {
        cids.add(row.cid);
      }
      this.entryMemoCids[key] = cids;
      const rows = list.map((row) => ({ ...row }));
      await this.enqueueWrite(async () => {
        await Promise.all(rows.map((row) => this.writeJson(this.sharedRecordKey('entryMemos', chainId, row.cid), row)));
        if (cids.size !== beforeSize) {
          await this.writeJson(this.sharedChainMetaKey('entryMemos', chainId), Array.from(cids).sort((a, b) => a - b));
        }
      });
    }
  }

  async listEntryMemos(query: ListEntryMemosQuery): Promise<{ total: number; rows: EntryMemoRecord[] }> {
    await this.ensureEntryMemosLoaded(query.chainId);
    const cids = Array.from(this.entryMemoCids[String(query.chainId)] ?? []).sort((a, b) => a - b);
    if (!cids.length) return { total: 0, rows: [] };
    const raws = await Promise.all(cids.map((cid) => this.options.client.get(this.sharedRecordKey('entryMemos', query.chainId, cid))));
    const rows: EntryMemoRecord[] = [];
    for (let i = 0; i < raws.length; i++) {
      const row = this.parseJson<EntryMemoRecord | null>(raws[i] ?? null, null);
      if (!row) continue;
      if (!Number.isInteger(row.cid) || row.cid < 0) continue;
      rows.push(row);
    }
    if (!rows.length) return { total: 0, rows: [] };
    const paged = applyEntryMemoQuery(rows, query);
    return { total: paged.total, rows: paged.rows.map((r) => ({ ...r })) };
  }

  async clearEntryMemos(chainId: number): Promise<void> {
    await this.ensureEntryMemosLoaded(chainId);
    const cids = Array.from(this.entryMemoCids[String(chainId)] ?? []);
    delete this.entryMemoCids[String(chainId)];
    await this.enqueueWrite(async () => {
      await Promise.all(cids.map((cid) => this.deleteOrReset(this.sharedRecordKey('entryMemos', chainId, cid), null)));
      await this.deleteOrReset(this.sharedChainMetaKey('entryMemos', chainId), []);
    });
  }

  async upsertEntryNullifiers(nullifiers: EntryNullifierRecord[]): Promise<void> {
    const grouped = new Map<number, EntryNullifierRecord[]>();
    for (const row of nullifiers) {
      const list = grouped.get(row.chainId) ?? [];
      list.push(row);
      grouped.set(row.chainId, list);
    }
    for (const [chainId, list] of grouped.entries()) {
      await this.ensureEntryNullifiersLoaded(chainId);
      const key = String(chainId);
      const nids = this.entryNullifierNids[key] ?? new Set<number>();
      const beforeSize = nids.size;
      for (const row of list) {
        if (!Number.isInteger(row.nid) || row.nid < 0) continue;
        nids.add(row.nid);
      }
      this.entryNullifierNids[key] = nids;
      const rows = list.map((row) => ({ ...row }));
      await this.enqueueWrite(async () => {
        await Promise.all(rows.map((row) => this.writeJson(this.sharedRecordKey('entryNullifiers', chainId, row.nid), row)));
        if (nids.size !== beforeSize) {
          await this.writeJson(this.sharedChainMetaKey('entryNullifiers', chainId), Array.from(nids).sort((a, b) => a - b));
        }
      });
    }
  }

  async listEntryNullifiers(query: ListEntryNullifiersQuery): Promise<{ total: number; rows: EntryNullifierRecord[] }> {
    await this.ensureEntryNullifiersLoaded(query.chainId);
    const nids = Array.from(this.entryNullifierNids[String(query.chainId)] ?? []).sort((a, b) => a - b);
    if (!nids.length) return { total: 0, rows: [] };
    const raws = await Promise.all(nids.map((nid) => this.options.client.get(this.sharedRecordKey('entryNullifiers', query.chainId, nid))));
    const rows: EntryNullifierRecord[] = [];
    for (let i = 0; i < raws.length; i++) {
      const row = this.parseJson<EntryNullifierRecord | null>(raws[i] ?? null, null);
      if (!row) continue;
      if (!Number.isInteger(row.nid) || row.nid < 0) continue;
      rows.push(row);
    }
    if (!rows.length) return { total: 0, rows: [] };
    const paged = applyEntryNullifierQuery(rows, query);
    return { total: paged.total, rows: paged.rows.map((r) => ({ ...r })) };
  }

  async clearEntryNullifiers(chainId: number): Promise<void> {
    await this.ensureEntryNullifiersLoaded(chainId);
    const nids = Array.from(this.entryNullifierNids[String(chainId)] ?? []);
    delete this.entryNullifierNids[String(chainId)];
    await this.enqueueWrite(async () => {
      await Promise.all(nids.map((nid) => this.deleteOrReset(this.sharedRecordKey('entryNullifiers', chainId, nid), null)));
      await this.deleteOrReset(this.sharedChainMetaKey('entryNullifiers', chainId), []);
    });
  }

  async getMerkleLeaves(chainId: number): Promise<Array<{ cid: number; commitment: Hex }> | undefined> {
    await this.ensureMerkleLeavesLoaded(chainId);
    const cids = Array.from(this.merkleLeafCids[String(chainId)] ?? []).sort((a, b) => a - b);
    if (!cids.length) return undefined;
    const raws = await Promise.all(cids.map((cid) => this.options.client.get(this.sharedRecordKey('merkleLeaves', chainId, cid))));
    const out: Array<{ cid: number; commitment: Hex }> = [];
    for (let i = 0; i < raws.length; i++) {
      const row = this.parseJson<{ cid: number; commitment: Hex } | null>(raws[i] ?? null, null);
      if (!row) continue;
      const cid = Number(row?.cid);
      const commitment = row?.commitment;
      if (!Number.isFinite(cid) || cid < 0) continue;
      if (typeof commitment !== 'string' || !commitment.startsWith('0x')) continue;
      out.push({ cid: Math.floor(cid), commitment });
    }
    out.sort((a, b) => a.cid - b.cid);
    return out.length ? out : undefined;
  }

  async getMerkleLeaf(chainId: number, cid: number) {
    await this.ensureMerkleLeavesLoaded(chainId);
    if (!this.merkleLeafCids[String(chainId)]?.has(cid)) return undefined;
    const raw = await this.options.client.get(this.sharedRecordKey('merkleLeaves', chainId, cid));
    const row = this.parseJson<{ cid: number; commitment: Hex } | null>(raw, null);
    if (!row) return undefined;
    return { chainId, cid: row.cid, commitment: row.commitment };
  }

  async appendMerkleLeaves(chainId: number, leaves: Array<{ cid: number; commitment: Hex }>): Promise<void> {
    if (!leaves.length) return;
    await this.ensureMerkleLeavesLoaded(chainId);
    const key = String(chainId);
    const cids = this.merkleLeafCids[key] ?? new Set<number>();
    const sorted = [...leaves].sort((a, b) => a.cid - b.cid);
    let next = cids.size;
    const fresh = sorted.filter((l) => Number.isFinite(l.cid) && l.cid >= next);
    if (!fresh.length) {
      return;
    }
    if (fresh[0]!.cid !== next) {
      throw new Error(`Non-contiguous merkle leaves append: expected cid=${next}, got cid=${fresh[0]!.cid}`);
    }
    for (const row of fresh) {
      if (row.cid !== next) throw new Error(`Non-contiguous merkle leaves append: expected cid=${next}, got cid=${row.cid}`);
      cids.add(row.cid);
      next++;
    }
    this.merkleLeafCids[key] = cids;
    const nextCids = Array.from(cids).sort((a, b) => a - b);
    await this.enqueueWrite(async () => {
      await Promise.all(fresh.map((row) => this.writeJson(this.sharedRecordKey('merkleLeaves', chainId, row.cid), row)));
      await this.writeJson(this.sharedChainMetaKey('merkleLeaves', chainId), nextCids);
    });
  }

  async clearMerkleLeaves(chainId: number): Promise<void> {
    await this.ensureMerkleLeavesLoaded(chainId);
    const cids = Array.from(this.merkleLeafCids[String(chainId)] ?? []);
    delete this.merkleLeafCids[String(chainId)];
    await this.enqueueWrite(async () => {
      await Promise.all(cids.map((cid) => this.deleteOrReset(this.sharedRecordKey('merkleLeaves', chainId, cid), null)));
      await this.deleteOrReset(this.sharedChainMetaKey('merkleLeaves', chainId), []);
    });
  }

  async getSyncCursor(chainId: number): Promise<SyncCursor | undefined> {
    await this.ensureWalletMetaLoaded();
    const cursor = await this.readCursor(chainId);
    return cursor ? { ...cursor } : undefined;
  }

  async setSyncCursor(chainId: number, cursor: SyncCursor): Promise<void> {
    await this.ensureWalletMetaLoaded();
    const existed = this.cursorChains.has(chainId);
    this.cursorChains.add(chainId);
    const normalized = this.normalizeCursor(cursor)!;
    this.cursorCache.set(chainId, normalized);
    await this.enqueueWrite(async () => {
      await this.writeJson(this.walletCursorKey(chainId), normalized);
      if (!existed) {
        const chains = Array.from(this.cursorChains).sort((a, b) => a - b);
        await this.writeJson(this.walletMetaKey('cursorChains'), chains);
      }
    });
  }

  async upsertUtxos(utxos: UtxoRecord[]): Promise<void> {
    if (!utxos.length) return;
    await this.ensureWalletMetaLoaded();
    const newRefs = new Set<string>();
    const rows: Array<{ ref: string; utxo: UtxoRecord }> = [];
    for (const utxo of utxos) {
      const ref = `${utxo.chainId}:${utxo.commitment}`;
      const prev = await this.readUtxo(ref);
      const merged = { ...utxo, isSpent: prev?.isSpent ?? utxo.isSpent };
      this.utxoCache.set(ref, merged);
      this.utxoRefs.add(ref);
      if (!prev) newRefs.add(ref);
      rows.push({ ref, utxo: merged });
    }
    await this.enqueueWrite(async () => {
      await Promise.all(rows.map(({ ref, utxo }) => this.writeJson(this.walletUtxoKey(ref), this.toPersistedUtxo(utxo))));
      if (newRefs.size) {
        await this.writeJson(this.walletMetaKey('utxoRefs'), Array.from(this.utxoRefs));
      }
    });
  }

  async listUtxos(query?: ListUtxosQuery): Promise<{ total: number; rows: UtxoRecord[] }> {
    await this.ensureWalletMetaLoaded();
    const refs = query?.chainId == null ? Array.from(this.utxoRefs) : Array.from(this.utxoRefs).filter((ref) => ref.startsWith(`${query.chainId}:`));
    const rows = await Promise.all(refs.map((ref) => this.readUtxo(ref)));
    const records = rows.filter((row): row is UtxoRecord => row != null);
    const paged = applyUtxoQuery(records, query);
    return { total: paged.total, rows: paged.rows.map((utxo) => ({ ...utxo })) };
  }

  async markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<number> {
    await this.ensureWalletMetaLoaded();
    const wanted = new Set(input.nullifiers.map((nf) => nf.toLowerCase()));
    let updated = 0;
    const rows: Array<{ ref: string; utxo: UtxoRecord }> = [];
    const refs = Array.from(this.utxoRefs).filter((ref) => ref.startsWith(`${input.chainId}:`));
    for (const ref of refs) {
      const utxo = await this.readUtxo(ref);
      if (!utxo) continue;
      if (utxo.chainId !== input.chainId) continue;
      if (!wanted.has(utxo.nullifier.toLowerCase())) continue;
      if (!utxo.isSpent) {
        const merged = { ...utxo, isSpent: true };
        this.utxoCache.set(ref, merged);
        rows.push({ ref, utxo: merged });
        updated++;
      }
    }
    if (rows.length) {
      await this.enqueueWrite(async () => {
        await Promise.all(rows.map(({ ref, utxo }) => this.writeJson(this.walletUtxoKey(ref), this.toPersistedUtxo(utxo))));
      });
    }
    return updated;
  }

  createOperation<TType extends OperationType>(
    input: Omit<StoredOperation<OperationDetailFor<TType>>, 'id' | 'createdAt' | 'status'> & Partial<Pick<StoredOperation<OperationDetailFor<TType>>, 'createdAt' | 'id' | 'status'>> & { type: TType },
  ) {
    const created = {
      ...input,
      id: input.id ?? newOperationId(),
      createdAt: input.createdAt ?? Date.now(),
      status: input.status ?? 'created',
    };
    this.operationIds = [created.id, ...this.operationIds.filter((id) => id !== created.id)];
    this.operations.unshift(created);
    const removedIds = this.pruneOperationIds();
    void this.enqueueWrite(async () => {
      await this.writeJson(this.walletOperationKey(created.id), created);
      this.operationCache.set(created.id, created);
      if (removedIds.length) {
        await Promise.all(removedIds.map((id) => this.deleteOrReset(this.walletOperationKey(id), null)));
      }
      await this.writeJson(this.walletMetaKey('operationIds'), this.operationIds);
    }).catch(() => undefined);
    return created;
  }

  updateOperation(id: string, patch: Partial<StoredOperation>) {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return;
    this.operations[idx] = { ...this.operations[idx]!, ...patch };
    const updated = this.operations[idx]!;
    this.operationCache.set(id, updated);
    void this.enqueueWrite(() => this.writeJson(this.walletOperationKey(id), updated)).catch(() => undefined);
  }

  deleteOperation(id: string): boolean {
    const idx = this.operations.findIndex((op) => op.id === id);
    if (idx === -1) return false;
    this.operations.splice(idx, 1);
    this.operationIds = this.operationIds.filter((value) => value !== id);
    this.operationCache.delete(id);
    void this.enqueueWrite(async () => {
      await this.deleteOrReset(this.walletOperationKey(id), null);
      await this.writeJson(this.walletMetaKey('operationIds'), this.operationIds);
    }).catch(() => undefined);
    return true;
  }

  clearOperations(): void {
    const ids = [...this.operationIds];
    this.operations = [];
    this.operationIds = [];
    this.operationCache.clear();
    void this.enqueueWrite(async () => {
      await Promise.all(ids.map((id) => this.deleteOrReset(this.walletOperationKey(id), null)));
      await this.deleteOrReset(this.walletMetaKey('operationIds'), []);
    }).catch(() => undefined);
  }

  pruneOperations(options?: { max?: number }): number {
    const removed = this.pruneOperationIds(options);
    if (!removed.length) return 0;
    void this.enqueueWrite(async () => {
      await Promise.all(removed.map((id) => this.deleteOrReset(this.walletOperationKey(id), null)));
      await this.writeJson(this.walletMetaKey('operationIds'), this.operationIds);
    }).catch(() => undefined);
    return removed.length;
  }

  listOperations(input?: number | ListOperationsQuery) {
    return applyOperationsQuery(this.operations, input);
  }
}

export interface KeyValueClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del?(key: string): Promise<void>;
}
