import type { ListOperationsQuery, OperationStatus, OperationType, StoredOperation } from './operationTypes';

const toSet = <T extends string>(value: T | T[] | undefined): Set<T> | undefined => {
  if (value == null) return undefined;
  return new Set(Array.isArray(value) ? value : [value]);
};

const defaultLimit = 50;

export function applyOperationsQuery(operations: StoredOperation[], input?: number | ListOperationsQuery): StoredOperation[] {
  const query: ListOperationsQuery = typeof input === 'number' || input == null ? { limit: input } : input;
  const limit = query.limit ?? defaultLimit;
  const offset = query.offset ?? 0;
  const typeSet = toSet<OperationType>(query.type);
  const statusSet = toSet<OperationStatus>(query.status);

  const source = query.sort === 'asc' ? [...operations].reverse() : operations;

  const filtered = source.filter((op) => {
    if (query.chainId != null && op.chainId !== query.chainId) return false;
    if (query.tokenId != null && op.tokenId !== query.tokenId) return false;
    if (typeSet && !typeSet.has(op.type)) return false;
    if (statusSet && !statusSet.has(op.status)) return false;
    return true;
  });

  return filtered.slice(offset, offset + limit);
}
