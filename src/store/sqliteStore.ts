import type {
  EntryMemoRecord,
  EntryNullifierRecord,
  Hex,
  ListEntryMemosQuery,
  ListEntryNullifiersQuery,
  ListUtxosQuery,
  MerkleLeafRecord,
  MerkleNodeRecord,
  MerkleTreeState,
  StorageAdapter,
  SyncCursor,
  UtxoRecord,
} from '../types';
import type { ListOperationsQuery, OperationDetailFor, OperationType, StoredOperation } from './internal/operationTypes';
import { newOperationId } from './internal/operationTypes';

type SqliteBindValue = string | number | bigint | Uint8Array | null;

interface SqliteStatement {
  run(...params: SqliteBindValue[]): unknown;
  get(...params: SqliteBindValue[]): unknown;
  all(...params: SqliteBindValue[]): unknown[];
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close?: () => void;
  pragma?: (pragma: string) => unknown;
}

interface SqliteOpenOptions {
  readonly?: boolean;
  create?: boolean;
  timeout?: number;
}

interface SqliteConstructor {
  new (filename: string, options?: SqliteOpenOptions): SqliteDatabase;
}

interface BetterSqliteConstructor {
  new (filename: string, options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number }): SqliteDatabase;
}

export type SqliteStoreOptions = {
  filename: string;
  walletId?: string;
  maxOperations?: number;
  readonly?: boolean;
  createIfMissing?: boolean;
  busyTimeoutMs?: number;
  pragmas?: string[];
  database?: SqliteDatabase;
};

type UtxoRow = {
  chain_id: number;
  asset_id: string;
  amount: string;
  commitment: Hex;
  nullifier: Hex;
  mk_index: number;
  is_frozen: number;
  is_spent: number;
  memo: Hex | null;
  created_at: number | null;
};

type OperationRow = {
  id: string;
  type: string;
  created_at: number;
  chain_id: number | null;
  token_id: string | null;
  status: string;
  request_url: string | null;
  relayer_tx_hash: Hex | null;
  tx_hash: Hex | null;
  detail_json: string | null;
  error: string | null;
};

const DEFAULT_PRAGMAS = ['journal_mode = WAL', 'synchronous = NORMAL', 'foreign_keys = ON', 'temp_store = MEMORY'];

const defaultLimit = 50;

function normalizeNumber(value: number | undefined): number | undefined {
  if (value == null) return undefined;
  const n = Math.floor(value);
  return Number.isFinite(n) ? n : undefined;
}

function boolToInt(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function intToBool(value: number): boolean {
  return value !== 0;
}

function toChanges(result: unknown): number {
  if (!result || typeof result !== 'object') return 0;
  const row = result as Record<string, unknown>;
  const changes = row.changes;
  if (typeof changes === 'number' && Number.isFinite(changes)) return Math.floor(changes);
  if (typeof changes === 'bigint') return Number(changes);
  return 0;
}

function toHexOrNull(value: unknown): Hex | null {
  if (typeof value !== 'string') return null;
  return value.startsWith('0x') ? (value as Hex) : null;
}

function sortTextValues(value: string | string[] | undefined): string[] | undefined {
  if (value == null) return undefined;
  const list = Array.isArray(value) ? value : [value];
  if (!list.length) return undefined;
  return Array.from(new Set(list));
}

export class SqliteStore implements StorageAdapter {
  private walletId: string | undefined;
  private readonly maxOperations: number;
  private db: SqliteDatabase | null;

  constructor(private readonly options: SqliteStoreOptions) {
    const max = options.maxOperations;
    this.maxOperations = max == null ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(max));
    this.walletId = options.walletId;
    this.db = options.database ?? null;
  }

  async init(options?: { walletId?: string }): Promise<void> {
    this.walletId = options?.walletId ?? this.walletId;
    if (!this.db) this.db = await this.openDatabase();
    this.initSchema();
    this.applyPragmas();
    this.pruneOperations();
  }

  async close(): Promise<void> {
    this.db?.close?.();
    this.db = null;
  }

  private walletKey(): string {
    return this.walletId ?? 'default';
  }

  private ensureDb(): SqliteDatabase {
    if (!this.db) {
      throw new Error('SqliteStore is not initialized. Call init() before use.');
    }
    return this.db;
  }

  private async openDatabase(): Promise<SqliteDatabase> {
    const filename = this.options.filename;
    if (!filename) throw new Error('SqliteStore requires a filename');

    const nodeSqlite = await this.tryOpenWithNodeSqlite(filename);
    if (nodeSqlite) return nodeSqlite;

    const betterSqlite = await this.tryOpenWithBetterSqlite(filename);
    if (betterSqlite) return betterSqlite;

    throw new Error(
      'SqliteStore requires SQLite runtime support. Use a Node runtime with node:sqlite, or install optional peer dependency better-sqlite3 (pnpm add better-sqlite3).',
    );
  }

  private async tryOpenWithNodeSqlite(filename: string): Promise<SqliteDatabase | null> {
    try {
      const sqliteModule = (await import('node:sqlite' as string)) as Record<string, unknown>;
      const ctor = sqliteModule.DatabaseSync as SqliteConstructor | undefined;
      if (!ctor) return null;
      const db = new ctor(filename, {
        readonly: this.options.readonly,
        create: this.options.createIfMissing ?? true,
        timeout: this.options.busyTimeoutMs,
      });
      return db;
    } catch {
      return null;
    }
  }

  private async tryOpenWithBetterSqlite(filename: string): Promise<SqliteDatabase | null> {
    try {
      const mod = (await import('better-sqlite3' as string)) as { default?: BetterSqliteConstructor };
      if (!mod.default) return null;
      const db = new mod.default(filename, {
        readonly: this.options.readonly,
        fileMustExist: (this.options.createIfMissing ?? true) === false,
        timeout: this.options.busyTimeoutMs,
      });
      return db;
    } catch {
      return null;
    }
  }

  private applyPragmas(): void {
    const db = this.ensureDb();
    const pragmas = this.options.pragmas ?? DEFAULT_PRAGMAS;
    for (const pragma of pragmas) {
      const sql = pragma.trim();
      if (!sql) continue;
      db.exec(`PRAGMA ${sql};`);
    }
  }

  private initSchema(): void {
    const db = this.ensureDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_cursors (
        wallet_id TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        memo INTEGER NOT NULL,
        nullifier INTEGER NOT NULL,
        merkle INTEGER NOT NULL,
        PRIMARY KEY (wallet_id, chain_id)
      );

      CREATE TABLE IF NOT EXISTS utxos (
        wallet_id TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        asset_id TEXT NOT NULL,
        amount TEXT NOT NULL,
        commitment TEXT NOT NULL,
        nullifier TEXT NOT NULL,
        mk_index INTEGER NOT NULL,
        is_frozen INTEGER NOT NULL,
        is_spent INTEGER NOT NULL,
        memo TEXT,
        created_at INTEGER,
        PRIMARY KEY (wallet_id, chain_id, commitment)
      );
      CREATE INDEX IF NOT EXISTS idx_utxos_wallet_chain ON utxos(wallet_id, chain_id);
      CREATE INDEX IF NOT EXISTS idx_utxos_wallet_asset ON utxos(wallet_id, asset_id);
      CREATE INDEX IF NOT EXISTS idx_utxos_wallet_nullifier ON utxos(wallet_id, chain_id, nullifier);
      CREATE INDEX IF NOT EXISTS idx_utxos_wallet_state ON utxos(wallet_id, is_spent, is_frozen);

      CREATE TABLE IF NOT EXISTS operations (
        wallet_id TEXT NOT NULL,
        id TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        chain_id INTEGER,
        token_id TEXT,
        status TEXT NOT NULL,
        request_url TEXT,
        relayer_tx_hash TEXT,
        tx_hash TEXT,
        detail_json TEXT,
        error TEXT,
        PRIMARY KEY (wallet_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_operations_wallet_created ON operations(wallet_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_operations_wallet_filters ON operations(wallet_id, chain_id, token_id, type, status);

      CREATE TABLE IF NOT EXISTS merkle_leaves (
        chain_id INTEGER NOT NULL,
        cid INTEGER NOT NULL,
        commitment TEXT NOT NULL,
        PRIMARY KEY (chain_id, cid)
      );

      CREATE TABLE IF NOT EXISTS merkle_nodes (
        chain_id INTEGER NOT NULL,
        id TEXT NOT NULL,
        level INTEGER NOT NULL,
        position INTEGER NOT NULL,
        hash TEXT NOT NULL,
        PRIMARY KEY (chain_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_merkle_nodes_chain_level_pos ON merkle_nodes(chain_id, level, position);

      CREATE TABLE IF NOT EXISTS merkle_trees (
        chain_id INTEGER PRIMARY KEY,
        root TEXT NOT NULL,
        total_elements INTEGER NOT NULL,
        last_updated INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entry_memos (
        chain_id INTEGER NOT NULL,
        cid INTEGER NOT NULL,
        commitment TEXT NOT NULL,
        memo TEXT NOT NULL,
        is_transparent INTEGER,
        asset_id TEXT,
        amount TEXT,
        partial_hash TEXT,
        tx_hash TEXT,
        created_at INTEGER,
        PRIMARY KEY (chain_id, cid)
      );
      CREATE INDEX IF NOT EXISTS idx_entry_memos_chain_created ON entry_memos(chain_id, created_at);

      CREATE TABLE IF NOT EXISTS entry_nullifiers (
        chain_id INTEGER NOT NULL,
        nid INTEGER NOT NULL,
        nullifier TEXT NOT NULL,
        created_at INTEGER,
        PRIMARY KEY (chain_id, nid)
      );
      CREATE INDEX IF NOT EXISTS idx_entry_nullifiers_chain_created ON entry_nullifiers(chain_id, created_at);
    `);
  }

  private row<T>(sql: string, params: SqliteBindValue[] = []): T | undefined {
    const out = this.ensureDb().prepare(sql).get(...params);
    if (out == null || typeof out !== 'object') return undefined;
    return out as T;
  }

  private rows<T>(sql: string, params: SqliteBindValue[] = []): T[] {
    const out = this.ensureDb().prepare(sql).all(...params);
    return out.filter((item): item is T => item != null && typeof item === 'object');
  }

  private run(sql: string, params: SqliteBindValue[] = []): number {
    const result = this.ensureDb().prepare(sql).run(...params);
    return toChanges(result);
  }

  private inClause(values: readonly string[]): string {
    return values.map(() => '?').join(', ');
  }

  async getSyncCursor(chainId: number): Promise<SyncCursor | undefined> {
    const row = this.row<{ memo: number; nullifier: number; merkle: number }>(
      `SELECT memo, nullifier, merkle FROM sync_cursors WHERE wallet_id = ? AND chain_id = ?`,
      [this.walletKey(), chainId],
    );
    if (!row) return undefined;
    return {
      memo: Number.isFinite(row.memo) ? row.memo : 0,
      nullifier: Number.isFinite(row.nullifier) ? row.nullifier : 0,
      merkle: Number.isFinite(row.merkle) ? row.merkle : 0,
    };
  }

  async setSyncCursor(chainId: number, cursor: SyncCursor): Promise<void> {
    this.run(
      `INSERT INTO sync_cursors (wallet_id, chain_id, memo, nullifier, merkle)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(wallet_id, chain_id) DO UPDATE SET
         memo = excluded.memo,
         nullifier = excluded.nullifier,
         merkle = excluded.merkle`,
      [this.walletKey(), chainId, cursor.memo, cursor.nullifier, cursor.merkle],
    );
  }

  async upsertUtxos(utxos: UtxoRecord[]): Promise<void> {
    if (!utxos.length) return;
    const db = this.ensureDb();
    const stmt = db.prepare(
      `INSERT INTO utxos (
        wallet_id, chain_id, asset_id, amount, commitment, nullifier, mk_index, is_frozen, is_spent, memo, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(wallet_id, chain_id, commitment) DO UPDATE SET
        asset_id = excluded.asset_id,
        amount = excluded.amount,
        nullifier = excluded.nullifier,
        mk_index = excluded.mk_index,
        is_frozen = excluded.is_frozen,
        memo = excluded.memo,
        created_at = excluded.created_at,
        is_spent = CASE
          WHEN utxos.is_spent = 1 THEN 1
          ELSE excluded.is_spent
        END`,
    );

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const utxo of utxos) {
        stmt.run(
          this.walletKey(),
          utxo.chainId,
          utxo.assetId,
          utxo.amount.toString(),
          utxo.commitment,
          utxo.nullifier,
          utxo.mkIndex,
          boolToInt(utxo.isFrozen),
          boolToInt(utxo.isSpent),
          utxo.memo ?? null,
          utxo.createdAt ?? null,
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async listUtxos(query?: ListUtxosQuery): Promise<{ total: number; rows: UtxoRecord[] }> {
    const includeSpent = query?.includeSpent ?? false;
    const includeFrozen = query?.includeFrozen ?? false;
    const spentFilter = query?.spent;
    const frozenFilter = query?.frozen;
    const orderBy = query?.orderBy ?? 'mkIndex';
    const order = query?.order ?? 'asc';

    const where: string[] = ['wallet_id = ?'];
    const args: SqliteBindValue[] = [this.walletKey()];

    if (query?.chainId != null) {
      where.push('chain_id = ?');
      args.push(query.chainId);
    }
    if (query?.assetId != null) {
      where.push('asset_id = ?');
      args.push(query.assetId);
    }

    if (spentFilter != null) {
      where.push('is_spent = ?');
      args.push(boolToInt(spentFilter));
    } else if (!includeSpent) {
      where.push('is_spent = 0');
    }

    if (frozenFilter != null) {
      where.push('is_frozen = ?');
      args.push(boolToInt(frozenFilter));
    } else if (!includeFrozen) {
      where.push('is_frozen = 0');
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalRow = this.row<{ total: number }>(`SELECT COUNT(1) AS total FROM utxos ${whereSql}`, args);
    const total = totalRow?.total ?? 0;

    const direction = order === 'desc' ? 'DESC' : 'ASC';
    const orderSql =
      orderBy === 'createdAt'
        ? `ORDER BY (created_at IS NULL) ASC, created_at ${direction}, mk_index ${direction}`
        : `ORDER BY mk_index ${direction}, (created_at IS NULL) ASC, created_at ${direction}`;

    const offset = Math.max(0, Math.floor(query?.offset ?? 0));
    const limit = query?.limit == null ? undefined : Math.max(0, Math.floor(query.limit));

    let sql =
      `SELECT chain_id, asset_id, amount, commitment, nullifier, mk_index, is_frozen, is_spent, memo, created_at
       FROM utxos ${whereSql} ${orderSql}`;
    const rowArgs = [...args];
    if (limit != null) {
      sql += ' LIMIT ? OFFSET ?';
      rowArgs.push(limit, offset);
    } else if (offset > 0) {
      sql += ' LIMIT -1 OFFSET ?';
      rowArgs.push(offset);
    }

    const rows = this.rows<UtxoRow>(sql, rowArgs);

    return {
      total,
      rows: rows.map((row) => ({
        chainId: row.chain_id,
        assetId: row.asset_id,
        amount: BigInt(row.amount),
        commitment: row.commitment,
        nullifier: row.nullifier,
        mkIndex: row.mk_index,
        isFrozen: intToBool(row.is_frozen),
        isSpent: intToBool(row.is_spent),
        memo: row.memo ?? undefined,
        createdAt: row.created_at ?? undefined,
      })),
    };
  }

  async markSpent(input: { chainId: number; nullifiers: Hex[] }): Promise<number> {
    if (!input.nullifiers.length) return 0;
    const lower = Array.from(new Set(input.nullifiers.map((nf) => nf.toLowerCase())));
    const placeholders = this.inClause(lower);
    const sql = `
      UPDATE utxos
      SET is_spent = 1
      WHERE wallet_id = ?
        AND chain_id = ?
        AND is_spent = 0
        AND lower(nullifier) IN (${placeholders})
    `;
    return this.run(sql, [this.walletKey(), input.chainId, ...lower]);
  }

  async getMerkleLeaves(chainId: number): Promise<Array<{ cid: number; commitment: Hex }> | undefined> {
    const rows = this.rows<{ cid: number; commitment: Hex }>(
      `SELECT cid, commitment FROM merkle_leaves WHERE chain_id = ? ORDER BY cid ASC`,
      [chainId],
    );
    return rows.length ? rows : undefined;
  }

  async getMerkleLeaf(chainId: number, cid: number): Promise<MerkleLeafRecord | undefined> {
    const row = this.row<{ cid: number; commitment: Hex }>(
      `SELECT cid, commitment FROM merkle_leaves WHERE chain_id = ? AND cid = ?`,
      [chainId, cid],
    );
    if (!row) return undefined;
    return { chainId, cid: row.cid, commitment: row.commitment };
  }

  async appendMerkleLeaves(chainId: number, leaves: Array<{ cid: number; commitment: Hex }>): Promise<void> {
    if (!leaves.length) return;
    const sorted = [...leaves].sort((a, b) => a.cid - b.cid);

    const nextRow = this.row<{ next: number }>(
      `SELECT COALESCE(MAX(cid), -1) + 1 AS next FROM merkle_leaves WHERE chain_id = ?`,
      [chainId],
    );
    let next = nextRow?.next ?? 0;

    const fresh = sorted.filter((leaf) => Number.isFinite(leaf.cid) && leaf.cid >= next);
    if (!fresh.length) return;
    if (fresh[0]!.cid !== next) {
      throw new Error(`Non-contiguous merkle leaves append: expected cid=${next}, got cid=${fresh[0]!.cid}`);
    }

    for (const leaf of fresh) {
      if (leaf.cid !== next) {
        throw new Error(`Non-contiguous merkle leaves append: expected cid=${next}, got cid=${leaf.cid}`);
      }
      next += 1;
    }

    const db = this.ensureDb();
    const stmt = db.prepare(`INSERT INTO merkle_leaves (chain_id, cid, commitment) VALUES (?, ?, ?)`);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const leaf of fresh) {
        stmt.run(chainId, leaf.cid, leaf.commitment);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async clearMerkleLeaves(chainId: number): Promise<void> {
    this.run(`DELETE FROM merkle_leaves WHERE chain_id = ?`, [chainId]);
  }

  async getMerkleNode(chainId: number, id: string): Promise<MerkleNodeRecord | undefined> {
    const row = this.row<{ id: string; level: number; position: number; hash: Hex }>(
      `SELECT id, level, position, hash FROM merkle_nodes WHERE chain_id = ? AND id = ?`,
      [chainId, id],
    );
    if (!row) return undefined;
    return { chainId, id: row.id, level: row.level, position: row.position, hash: row.hash };
  }

  async upsertMerkleNodes(chainId: number, nodes: MerkleNodeRecord[]): Promise<void> {
    if (!nodes.length) return;
    const db = this.ensureDb();
    const stmt = db.prepare(
      `INSERT INTO merkle_nodes (chain_id, id, level, position, hash)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chain_id, id) DO UPDATE SET
         level = excluded.level,
         position = excluded.position,
         hash = excluded.hash`,
    );
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const node of nodes) {
        stmt.run(chainId, node.id, node.level, node.position, node.hash);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async clearMerkleNodes(chainId: number): Promise<void> {
    this.run(`DELETE FROM merkle_nodes WHERE chain_id = ?`, [chainId]);
  }

  async getMerkleTree(chainId: number): Promise<MerkleTreeState | undefined> {
    const row = this.row<{ root: unknown; total_elements: number; last_updated: number }>(
      `SELECT root, total_elements, last_updated FROM merkle_trees WHERE chain_id = ?`,
      [chainId],
    );
    if (!row) return undefined;

    const root = toHexOrNull(row.root);
    if (!root) return undefined;

    const totalElements = Number(row.total_elements);
    if (!Number.isFinite(totalElements) || totalElements < 0) return undefined;

    const lastUpdated = Number(row.last_updated);

    return {
      chainId,
      root,
      totalElements: Math.floor(totalElements),
      lastUpdated: Number.isFinite(lastUpdated) ? Math.floor(lastUpdated) : 0,
    };
  }

  async setMerkleTree(chainId: number, tree: MerkleTreeState): Promise<void> {
    this.run(
      `INSERT INTO merkle_trees (chain_id, root, total_elements, last_updated)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chain_id) DO UPDATE SET
         root = excluded.root,
         total_elements = excluded.total_elements,
         last_updated = excluded.last_updated`,
      [chainId, tree.root, tree.totalElements, tree.lastUpdated],
    );
  }

  async clearMerkleTree(chainId: number): Promise<void> {
    this.run(`DELETE FROM merkle_trees WHERE chain_id = ?`, [chainId]);
  }

  async upsertEntryMemos(memos: EntryMemoRecord[]): Promise<void> {
    if (!memos.length) return;
    const db = this.ensureDb();
    const stmt = db.prepare(
      `INSERT INTO entry_memos (
        chain_id, cid, commitment, memo, is_transparent, asset_id, amount, partial_hash, tx_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chain_id, cid) DO UPDATE SET
        commitment = excluded.commitment,
        memo = excluded.memo,
        is_transparent = excluded.is_transparent,
        asset_id = excluded.asset_id,
        amount = excluded.amount,
        partial_hash = excluded.partial_hash,
        tx_hash = excluded.tx_hash,
        created_at = excluded.created_at`,
    );

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const memo of memos) {
        if (!Number.isInteger(memo.cid) || memo.cid < 0) continue;
        stmt.run(
          memo.chainId,
          memo.cid,
          memo.commitment,
          memo.memo,
          memo.isTransparent == null ? null : boolToInt(Boolean(memo.isTransparent)),
          memo.assetId ?? null,
          memo.amount ?? null,
          memo.partialHash ?? null,
          memo.txHash ?? null,
          memo.createdAt ?? null,
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async listEntryMemos(query: ListEntryMemosQuery): Promise<{ total: number; rows: EntryMemoRecord[] }> {
    const cidFrom = normalizeNumber(query.cidFrom);
    const cidTo = normalizeNumber(query.cidTo);
    const createdAtFrom = normalizeNumber(query.createdAtFrom);
    const createdAtTo = normalizeNumber(query.createdAtTo);

    const where: string[] = ['chain_id = ?'];
    const args: SqliteBindValue[] = [query.chainId];

    if (cidFrom != null) {
      where.push('cid >= ?');
      args.push(cidFrom);
    }
    if (cidTo != null) {
      where.push('cid <= ?');
      args.push(cidTo);
    }
    if (createdAtFrom != null) {
      where.push('created_at IS NOT NULL AND created_at >= ?');
      args.push(createdAtFrom);
    }
    if (createdAtTo != null) {
      where.push('created_at IS NOT NULL AND created_at <= ?');
      args.push(createdAtTo);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalRow = this.row<{ total: number }>(`SELECT COUNT(1) AS total FROM entry_memos ${whereSql}`, args);
    const total = totalRow?.total ?? 0;

    const orderBy = query.orderBy ?? 'cid';
    const order = query.order ?? 'asc';
    const direction = order === 'desc' ? 'DESC' : 'ASC';
    const orderSql =
      orderBy === 'createdAt'
        ? `ORDER BY (created_at IS NULL) ASC, created_at ${direction}, cid ${direction}`
        : `ORDER BY cid ${direction}, (created_at IS NULL) ASC, created_at ${direction}`;

    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const limit = query.limit == null ? undefined : Math.max(0, Math.floor(query.limit));

    let sql =
      `SELECT chain_id, cid, commitment, memo, is_transparent, asset_id, amount, partial_hash, tx_hash, created_at
       FROM entry_memos ${whereSql} ${orderSql}`;
    const rowArgs = [...args];
    if (limit != null) {
      sql += ' LIMIT ? OFFSET ?';
      rowArgs.push(limit, offset);
    } else if (offset > 0) {
      sql += ' LIMIT -1 OFFSET ?';
      rowArgs.push(offset);
    }

    const rows = this.rows<{
      chain_id: number;
      cid: number;
      commitment: Hex;
      memo: Hex;
      is_transparent: number | null;
      asset_id: Hex | null;
      amount: Hex | null;
      partial_hash: Hex | null;
      tx_hash: Hex | null;
      created_at: number | null;
    }>(sql, rowArgs);

    return {
      total,
      rows: rows.map((row) => ({
        chainId: row.chain_id,
        cid: row.cid,
        commitment: row.commitment,
        memo: row.memo,
        isTransparent: row.is_transparent == null ? undefined : intToBool(row.is_transparent),
        assetId: row.asset_id ?? undefined,
        amount: row.amount ?? undefined,
        partialHash: row.partial_hash ?? undefined,
        txHash: row.tx_hash ?? undefined,
        createdAt: row.created_at ?? undefined,
      })),
    };
  }

  async clearEntryMemos(chainId: number): Promise<void> {
    this.run(`DELETE FROM entry_memos WHERE chain_id = ?`, [chainId]);
  }

  async upsertEntryNullifiers(nullifiers: EntryNullifierRecord[]): Promise<void> {
    if (!nullifiers.length) return;
    const db = this.ensureDb();
    const stmt = db.prepare(
      `INSERT INTO entry_nullifiers (chain_id, nid, nullifier, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chain_id, nid) DO UPDATE SET
         nullifier = excluded.nullifier,
         created_at = excluded.created_at`,
    );

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of nullifiers) {
        if (!Number.isInteger(row.nid) || row.nid < 0) continue;
        stmt.run(row.chainId, row.nid, row.nullifier, row.createdAt ?? null);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async listEntryNullifiers(query: ListEntryNullifiersQuery): Promise<{ total: number; rows: EntryNullifierRecord[] }> {
    const nidFrom = normalizeNumber(query.nidFrom);
    const nidTo = normalizeNumber(query.nidTo);
    const createdAtFrom = normalizeNumber(query.createdAtFrom);
    const createdAtTo = normalizeNumber(query.createdAtTo);

    const where: string[] = ['chain_id = ?'];
    const args: SqliteBindValue[] = [query.chainId];

    if (nidFrom != null) {
      where.push('nid >= ?');
      args.push(nidFrom);
    }
    if (nidTo != null) {
      where.push('nid <= ?');
      args.push(nidTo);
    }
    if (createdAtFrom != null) {
      where.push('created_at IS NOT NULL AND created_at >= ?');
      args.push(createdAtFrom);
    }
    if (createdAtTo != null) {
      where.push('created_at IS NOT NULL AND created_at <= ?');
      args.push(createdAtTo);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalRow = this.row<{ total: number }>(`SELECT COUNT(1) AS total FROM entry_nullifiers ${whereSql}`, args);
    const total = totalRow?.total ?? 0;

    const orderBy = query.orderBy ?? 'nid';
    const order = query.order ?? 'asc';
    const direction = order === 'desc' ? 'DESC' : 'ASC';
    const orderSql =
      orderBy === 'createdAt'
        ? `ORDER BY (created_at IS NULL) ASC, created_at ${direction}, nid ${direction}`
        : `ORDER BY nid ${direction}, (created_at IS NULL) ASC, created_at ${direction}`;

    const offset = Math.max(0, Math.floor(query.offset ?? 0));
    const limit = query.limit == null ? undefined : Math.max(0, Math.floor(query.limit));

    let sql =
      `SELECT chain_id, nid, nullifier, created_at
       FROM entry_nullifiers ${whereSql} ${orderSql}`;
    const rowArgs = [...args];
    if (limit != null) {
      sql += ' LIMIT ? OFFSET ?';
      rowArgs.push(limit, offset);
    } else if (offset > 0) {
      sql += ' LIMIT -1 OFFSET ?';
      rowArgs.push(offset);
    }

    const rows = this.rows<{ chain_id: number; nid: number; nullifier: Hex; created_at: number | null }>(sql, rowArgs);

    return {
      total,
      rows: rows.map((row) => ({
        chainId: row.chain_id,
        nid: row.nid,
        nullifier: row.nullifier,
        createdAt: row.created_at ?? undefined,
      })),
    };
  }

  async clearEntryNullifiers(chainId: number): Promise<void> {
    this.run(`DELETE FROM entry_nullifiers WHERE chain_id = ?`, [chainId]);
  }

  private getOperationById(id: string): StoredOperation | undefined {
    const row = this.row<OperationRow>(
      `SELECT id, type, created_at, chain_id, token_id, status, request_url, relayer_tx_hash, tx_hash, detail_json, error
       FROM operations
       WHERE wallet_id = ? AND id = ?`,
      [this.walletKey(), id],
    );
    if (!row) return undefined;
    return this.operationFromRow(row);
  }

  private operationFromRow(row: OperationRow): StoredOperation {
    let detail: Record<string, unknown> | undefined;
    if (row.detail_json) {
      try {
        const parsed = JSON.parse(row.detail_json) as unknown;
        if (parsed && typeof parsed === 'object') detail = parsed as Record<string, unknown>;
      } catch {
        detail = undefined;
      }
    }

    return {
      id: row.id,
      type: row.type as OperationType,
      createdAt: row.created_at,
      chainId: row.chain_id ?? undefined,
      tokenId: row.token_id ?? undefined,
      status: row.status as StoredOperation['status'],
      requestUrl: row.request_url ?? undefined,
      relayerTxHash: row.relayer_tx_hash ?? undefined,
      txHash: row.tx_hash ?? undefined,
      detail,
      error: row.error ?? undefined,
    };
  }

  private upsertOperationRow(operation: StoredOperation): void {
    this.run(
      `INSERT INTO operations (
        wallet_id, id, type, created_at, chain_id, token_id, status, request_url, relayer_tx_hash, tx_hash, detail_json, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(wallet_id, id) DO UPDATE SET
        type = excluded.type,
        created_at = excluded.created_at,
        chain_id = excluded.chain_id,
        token_id = excluded.token_id,
        status = excluded.status,
        request_url = excluded.request_url,
        relayer_tx_hash = excluded.relayer_tx_hash,
        tx_hash = excluded.tx_hash,
        detail_json = excluded.detail_json,
        error = excluded.error`,
      [
        this.walletKey(),
        operation.id,
        operation.type,
        operation.createdAt,
        operation.chainId ?? null,
        operation.tokenId ?? null,
        operation.status,
        operation.requestUrl ?? null,
        operation.relayerTxHash ?? null,
        operation.txHash ?? null,
        operation.detail == null ? null : JSON.stringify(operation.detail),
        operation.error ?? null,
      ],
    );
  }

  createOperation<TType extends OperationType>(
    input: Omit<StoredOperation<OperationDetailFor<TType>>, 'id' | 'createdAt' | 'status'> &
      Partial<Pick<StoredOperation<OperationDetailFor<TType>>, 'createdAt' | 'id' | 'status'>> & { type: TType },
  ): StoredOperation<OperationDetailFor<TType>> & { type: TType } {
    const created = {
      ...input,
      id: input.id ?? newOperationId(),
      createdAt: input.createdAt ?? Date.now(),
      status: input.status ?? 'created',
    };

    this.upsertOperationRow(created);
    this.pruneOperations();
    return created;
  }

  updateOperation(id: string, patch: Partial<StoredOperation>): void {
    const current = this.getOperationById(id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.upsertOperationRow(next);
  }

  deleteOperation(id: string): boolean {
    const changes = this.run(`DELETE FROM operations WHERE wallet_id = ? AND id = ?`, [this.walletKey(), id]);
    return changes > 0;
  }

  clearOperations(): void {
    this.run(`DELETE FROM operations WHERE wallet_id = ?`, [this.walletKey()]);
  }

  pruneOperations(options?: { max?: number }): number {
    const limit = Math.max(0, Math.floor(options?.max ?? this.maxOperations));
    const victims = this.rows<{ id: string }>(
      `SELECT id
       FROM operations
       WHERE wallet_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT -1 OFFSET ?`,
      [this.walletKey(), limit],
    );

    if (!victims.length) return 0;

    const ids = victims.map((v) => v.id);
    const placeholders = this.inClause(ids);
    this.run(`DELETE FROM operations WHERE wallet_id = ? AND id IN (${placeholders})`, [this.walletKey(), ...ids]);
    return ids.length;
  }

  listOperations(input?: number | ListOperationsQuery): StoredOperation[] {
    const query: ListOperationsQuery = typeof input === 'number' || input == null ? { limit: input } : input;

    const limit = query.limit ?? defaultLimit;
    const offset = query.offset ?? 0;
    const typeValues = sortTextValues(query.type);
    const statusValues = sortTextValues(query.status);

    const where: string[] = ['wallet_id = ?'];
    const args: SqliteBindValue[] = [this.walletKey()];

    if (query.chainId != null) {
      where.push('chain_id = ?');
      args.push(query.chainId);
    }
    if (query.tokenId != null) {
      where.push('token_id = ?');
      args.push(query.tokenId);
    }
    if (typeValues?.length) {
      where.push(`type IN (${this.inClause(typeValues)})`);
      args.push(...typeValues);
    }
    if (statusValues?.length) {
      where.push(`status IN (${this.inClause(statusValues)})`);
      args.push(...statusValues);
    }

    const sort = query.sort === 'asc' ? 'ASC' : 'DESC';
    const sql = `
      SELECT id, type, created_at, chain_id, token_id, status, request_url, relayer_tx_hash, tx_hash, detail_json, error
      FROM operations
      WHERE ${where.join(' AND ')}
      ORDER BY created_at ${sort}, id ${sort}
      LIMIT ? OFFSET ?
    `;

    const rows = this.rows<OperationRow>(sql, [...args, Math.max(0, Math.floor(limit)), Math.max(0, Math.floor(offset))]);
    return rows.map((row) => this.operationFromRow(row));
  }
}
