import { useEffect, useState } from 'react';
import type { TokenMetadata } from '@ocash/sdk';
import { defineChain } from 'viem';
import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { formatAmount } from '../utils/format';
import type { DemoConfig, FeeRow } from './constants';

export const formatTokenAmount = (value: bigint, token: TokenMetadata | null | undefined) => {
  const decimals = token?.decimals ?? 18;
  return formatAmount(value, decimals);
};

const assertNonEmpty: <T>(value: T[]) => asserts value is [T, ...T[]] = (value) => {
  if (value.length === 0) throw new Error('Expected non-empty array');
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

export const buildWagmiConfig = (config: DemoConfig) => {
  const chains = (config.chains ?? [])
    .filter((chain) => Boolean(chain.rpcUrl))
    .map((chain) =>
      defineChain({
        id: chain.chainId,
        name: `OCash ${chain.chainId}`,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [chain.rpcUrl as string] } },
      }),
    );

  if (!chains.length) {
    const fallback = defineChain({
      id: 11155111,
      name: 'Sepolia',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['https://sepolia.drpc.org'] } },
    });
    const transports = { [fallback.id]: http(fallback.rpcUrls.default.http[0]) };
    return createConfig({ chains: [fallback], connectors: [injected()], transports });
  }

  assertNonEmpty(chains);
  const transports = Object.fromEntries(chains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])])) as Record<number, ReturnType<typeof http>>;
  return createConfig({ chains, connectors: [injected()], transports });
};
