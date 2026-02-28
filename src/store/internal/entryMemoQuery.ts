import type { EntryMemoRecord, ListEntryMemosQuery, ListEntryMemosResult } from '../../types';

/**
 * Normalize numeric inputs to finite integers.
 */
function normalizeNumber(value: number | undefined) {
  if (value == null) return undefined;
  const num = Math.floor(value);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Compare createdAt fields with optional presence handling.
 */
function compareCreatedAt(a: EntryMemoRecord, b: EntryMemoRecord, factor: number) {
  const aHas = a.createdAt != null;
  const bHas = b.createdAt != null;
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (!aHas || !bHas) return 0;
  const diff = (a.createdAt as number) - (b.createdAt as number);
  return diff === 0 ? 0 : diff * factor;
}

/**
 * Apply filters/sort/pagination for entry memo rows.
 */
export function applyEntryMemoQuery(rows: EntryMemoRecord[], query: ListEntryMemosQuery): ListEntryMemosResult {
  const orderBy = query.orderBy ?? 'cid';
  const order = query.order ?? 'asc';
  const factor = order === 'desc' ? -1 : 1;

  const cidFrom = normalizeNumber(query.cidFrom);
  const cidTo = normalizeNumber(query.cidTo);
  const createdAtFrom = normalizeNumber(query.createdAtFrom);
  const createdAtTo = normalizeNumber(query.createdAtTo);

  let filtered = rows;
  if (cidFrom != null) filtered = filtered.filter((row) => row.cid >= cidFrom);
  if (cidTo != null) filtered = filtered.filter((row) => row.cid <= cidTo);
  if (createdAtFrom != null) filtered = filtered.filter((row) => row.createdAt != null && row.createdAt >= createdAtFrom);
  if (createdAtTo != null) filtered = filtered.filter((row) => row.createdAt != null && row.createdAt <= createdAtTo);

  const sorted = [...filtered].sort((a, b) => {
    if (orderBy === 'createdAt') {
      const createdDiff = compareCreatedAt(a, b, factor);
      if (createdDiff !== 0) return createdDiff;
      const cidDiff = a.cid - b.cid;
      return cidDiff === 0 ? 0 : cidDiff * factor;
    }
    const cidDiff = a.cid - b.cid;
    if (cidDiff !== 0) return cidDiff * factor;
    const createdDiff = compareCreatedAt(a, b, factor);
    return createdDiff;
  });

  const total = sorted.length;
  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const limit = query.limit == null ? undefined : Math.max(0, Math.floor(query.limit));
  const rowsPage = limit == null ? sorted.slice(offset) : sorted.slice(offset, offset + limit);
  return { total, rows: rowsPage };
}
