import type { Address } from 'viem';
import type { TokenMetadata } from '../types';
import { SdkError } from '../errors';
import { isHexStrict } from '../utils/hex';

export type TokenMetadataInput = Omit<TokenMetadata, 'viewerPk' | 'freezerPk' | 'depositFeeBps' | 'withdrawFeeBps'> & {
  viewerPk: readonly [string, string] | readonly [bigint, bigint];
  freezerPk: readonly [string, string] | readonly [bigint, bigint];
  depositFeeBps?: number | bigint;
  withdrawFeeBps?: number | bigint;
};

const toStringPair = (value: readonly [string, string] | readonly [bigint, bigint], name: string): [string, string] => {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new SdkError('CONFIG', `Invalid ${name}: expected [x,y]`, { value });
  }
  return [String(value[0] ?? ''), String(value[1] ?? '')];
};

const toFiniteNumberOrUndefined = (value: number | bigint | undefined): number | undefined => {
  if (value == null) return undefined;
  const n = typeof value === 'bigint' ? Number(value) : value;
  return Number.isFinite(n) ? n : undefined;
};

const toAddressOrThrow = (value: Address, name: string): Address => {
  if (isHexStrict(value, { minBytes: 20 })) return value as Address;
  throw new SdkError('CONFIG', `Invalid ${name}: expected 20-byte hex address`, { value });
};

const toBigintStringOrUndefined = (value: bigint | string | undefined): bigint | string | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && value.length) {
    try {
      BigInt(value);
      return value;
    } catch {
      return undefined;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.floor(value));
  return undefined;
};

export const normalizeTokenMetadata = (input: TokenMetadataInput): TokenMetadata => {
  if (!input || typeof input !== 'object') {
    throw new SdkError('CONFIG', 'Invalid token metadata', { input });
  }

  const id = typeof input.id === 'string' ? input.id : '';
  if (!id.length) throw new SdkError('CONFIG', 'Token id is required', { input });

  const wrappedErc20 = toAddressOrThrow(input.wrappedErc20, 'token.wrappedErc20');
  const viewerPk = toStringPair(input.viewerPk, 'token.viewerPk');
  const freezerPk = toStringPair(input.freezerPk, 'token.freezerPk');

  const symbol = typeof input.symbol === 'string' ? input.symbol : '';
  const decimals = typeof input.decimals === 'number' && Number.isFinite(input.decimals) ? input.decimals : 0;

  const depositFeeBps = toFiniteNumberOrUndefined(input.depositFeeBps);
  const withdrawFeeBps = toFiniteNumberOrUndefined(input.withdrawFeeBps);

  const transferMaxAmount = toBigintStringOrUndefined(input.transferMaxAmount);
  const withdrawMaxAmount = toBigintStringOrUndefined(input.withdrawMaxAmount);

  return {
    id,
    symbol,
    decimals,
    wrappedErc20,
    viewerPk,
    freezerPk,
    depositFeeBps,
    withdrawFeeBps,
    transferMaxAmount,
    withdrawMaxAmount,
  };
};
