import type { ChainConfigInput, TokenMetadata } from '@ocash/sdk';
import { toHex } from 'viem';

export const getChain = (chains: ChainConfigInput[], chainId?: number) => {
  if (chainId == null) return chains[0]!;
  const found = chains.find((c) => c.chainId === chainId);
  if (!found) throw new Error(`chainId not found in config: ${chainId}`);
  return found;
};

export const getToken = (chain: ChainConfigInput, tokenIdOrSymbol?: string) => {
  const tokens = chain.tokens ?? [];
  if (!tokenIdOrSymbol) return tokens[0]!;
  const byId = tokens.find((t) => t.id === tokenIdOrSymbol);
  if (byId) return byId;
  const bySymbol = tokens.find((t) => t.symbol.toLowerCase() === tokenIdOrSymbol.toLowerCase());
  if (bySymbol) return bySymbol;
  // allow selecting by 1-based index (e.g. "1" => tokens[0])
  if (/^\d+$/.test(tokenIdOrSymbol)) {
    const idx = Number(tokenIdOrSymbol);
    if (Number.isSafeInteger(idx) && idx >= 1 && idx <= tokens.length) return tokens[idx - 1]!;
  }
  throw new Error(`token not found: ${tokenIdOrSymbol}`);
};

export const tokenHexId = (token: TokenMetadata) => toHex(BigInt(token.id));
