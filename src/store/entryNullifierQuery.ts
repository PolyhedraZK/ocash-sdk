import type { EntryNullifierRecord, ListEntryNullifiersQuery, ListEntryNullifiersResult } from '../types';

function normalizeNumber(value: number | undefined) {
  if (value == null) return undefined;
  const num = Math.floor(value);
  return Number.isFinite(num) ? num : undefined;
}

function compareCreatedAt(a: EntryNullifierRecord, b: EntryNullifierRecord, factor: number) {
  const aHas = a.createdAt != null;
  const bHas = b.createdAt != null;
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (!aHas || !bHas) return 0;
  const diff = (a.createdAt as number) - (b.createdAt as number);
  return diff === 0 ? 0 : diff * factor;
}

export function applyEntryNullifierQuery(rows: EntryNullifierRecord[], query: ListEntryNullifiersQuery): ListEntryNullifiersResult {
  const orderBy = query.orderBy ?? 'nid';
  const order = query.order ?? 'asc';
  const factor = order === 'desc' ? -1 : 1;

  const nidFrom = normalizeNumber(query.nidFrom);
  const nidTo = normalizeNumber(query.nidTo);
  const createdAtFrom = normalizeNumber(query.createdAtFrom);
  const createdAtTo = normalizeNumber(query.createdAtTo);

  let filtered = rows;
  if (nidFrom != null) filtered = filtered.filter((row) => row.nid >= nidFrom);
  if (nidTo != null) filtered = filtered.filter((row) => row.nid <= nidTo);
  if (createdAtFrom != null) filtered = filtered.filter((row) => row.createdAt != null && row.createdAt >= createdAtFrom);
  if (createdAtTo != null) filtered = filtered.filter((row) => row.createdAt != null && row.createdAt <= createdAtTo);

  const sorted = [...filtered].sort((a, b) => {
    if (orderBy === 'createdAt') {
      const createdDiff = compareCreatedAt(a, b, factor);
      if (createdDiff !== 0) return createdDiff;
      const nidDiff = a.nid - b.nid;
      return nidDiff === 0 ? 0 : nidDiff * factor;
    }
    const nidDiff = a.nid - b.nid;
    if (nidDiff !== 0) return nidDiff * factor;
    const createdDiff = compareCreatedAt(a, b, factor);
    return createdDiff;
  });

  const total = sorted.length;
  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const limit = query.limit == null ? undefined : Math.max(0, Math.floor(query.limit));
  const rowsPage = limit == null ? sorted.slice(offset) : sorted.slice(offset, offset + limit);
  return { total, rows: rowsPage };
}
