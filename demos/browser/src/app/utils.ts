import { useEffect, useState } from 'react';
import type { TokenMetadata } from '@ocash/sdk';
import { formatAmount } from '../utils/format';
import type { FeeRow } from './constants';

export const formatTokenAmount = (value: bigint, token: TokenMetadata | null | undefined) => {
  const decimals = token?.decimals ?? 18;
  return formatAmount(value, decimals);
};

export const formatNativeAmount = (value: bigint) => formatAmount(value, 18);

export const formatFeeRows = (rows: FeeRow[]) => rows.filter((row) => row.value !== '');

export const useDebouncedValue = <T,>(value: T, delayMs: number) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};
