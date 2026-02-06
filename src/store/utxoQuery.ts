import type { ListUtxosQuery, ListUtxosResult, UtxoRecord } from '../types';

function normalizeNumber(value: number | undefined) {
  if (value == null) return undefined;
  const num = Math.floor(value);
  return Number.isFinite(num) ? num : undefined;
}

function compareCreatedAt(a: UtxoRecord, b: UtxoRecord, factor: number) {
  const aHas = a.createdAt != null;
  const bHas = b.createdAt != null;
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (!aHas || !bHas) return 0;
  const diff = (a.createdAt as number) - (b.createdAt as number);
  return diff === 0 ? 0 : diff * factor;
}

export function applyUtxoQuery(rows: UtxoRecord[], query?: ListUtxosQuery): ListUtxosResult {
  const includeSpent = query?.includeSpent ?? false;
  const includeFrozen = query?.includeFrozen ?? false;
  const spentFilter = query?.spent;
  const frozenFilter = query?.frozen;
  const orderBy = query?.orderBy ?? 'mkIndex';
  const order = query?.order ?? 'asc';
  const factor = order === 'desc' ? -1 : 1;

  let filtered = rows.filter((utxo) => {
    if (query?.chainId != null && utxo.chainId !== query.chainId) return false;
    if (query?.assetId != null && utxo.assetId !== query.assetId) return false;
    if (spentFilter != null) {
      if (utxo.isSpent !== spentFilter) return false;
    } else if (!includeSpent && utxo.isSpent) {
      return false;
    }
    if (frozenFilter != null) {
      if (utxo.isFrozen !== frozenFilter) return false;
    } else if (!includeFrozen && utxo.isFrozen) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (orderBy === 'createdAt') {
      const createdDiff = compareCreatedAt(a, b, factor);
      if (createdDiff !== 0) return createdDiff;
      const mkDiff = a.mkIndex - b.mkIndex;
      return mkDiff === 0 ? 0 : mkDiff * factor;
    }
    const mkDiff = a.mkIndex - b.mkIndex;
    if (mkDiff !== 0) return mkDiff * factor;
    const createdDiff = compareCreatedAt(a, b, factor);
    return createdDiff;
  });

  const total = sorted.length;
  const offset = Math.max(0, Math.floor(query?.offset ?? 0));
  const limit = query?.limit == null ? undefined : Math.max(0, Math.floor(query.limit));
  const rowsPage = limit == null ? sorted.slice(offset) : sorted.slice(offset, offset + limit);
  return { total, rows: rowsPage };
}
