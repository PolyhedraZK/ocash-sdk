import type { Address } from 'viem';
import type { TokenMetadata } from '../types';
import { SdkError } from '../errors';
import { isHexStrict } from '../utils/hex';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

const get = (obj: Record<string, unknown>, key: string): unknown => obj[key];

const getFirstDefined = (obj: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    const v = get(obj, k);
    if (v !== undefined) return v;
  }
  return undefined;
};

const toStringPair = (value: unknown, name: string): [string, string] => {
  const arr = Array.isArray(value) ? value : null;
  if (!arr || arr.length !== 2) throw new SdkError('CONFIG', `Invalid ${name}: expected [x,y]`, { value });
  return [String(arr[0] ?? ''), String(arr[1] ?? '')];
};

const toFiniteNumberOrUndefined = (value: unknown): number | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.length) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const toAddressOrThrow = (value: unknown, name: string): Address => {
  if (isHexStrict(value, { minBytes: 20 })) return value as Address;
  throw new SdkError('CONFIG', `Invalid ${name}: expected 20-byte hex address`, { value });
};

const toBigintStringOrUndefined = (value: unknown): bigint | string | undefined => {
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

/**
 * Normalize token metadata from app-style or sdk-style shapes.
 *
 * Supported legacy fields (app):
 * - `wrapped_erc20` (instead of `wrappedErc20`)
 * - `viewerPK` / `freezerPK` (instead of `viewerPk` / `freezerPk`)
 * - `depositFeeBPS` / `withdrawFeeBPS` (instead of `depositFeeBps` / `withdrawFeeBps`)
 */
export const normalizeTokenMetadata = (input: unknown): TokenMetadata => {
  if (!isRecord(input)) throw new SdkError('CONFIG', 'Invalid token metadata', { input });

  const idRaw = getFirstDefined(input, ['id', 'poolId']);
  const id = typeof idRaw === 'string' ? idRaw : idRaw != null ? String(idRaw) : '';
  if (!id.length) throw new SdkError('CONFIG', 'Token id is required', { input });

  const wrappedErc20 = toAddressOrThrow(getFirstDefined(input, ['wrappedErc20', 'wrapped_erc20', 'token']), 'token.wrappedErc20');
  const viewerPk = toStringPair(getFirstDefined(input, ['viewerPk', 'viewerPK']), 'token.viewerPk');
  const freezerPk = toStringPair(getFirstDefined(input, ['freezerPk', 'freezerPK']), 'token.freezerPk');

  const symbolRaw = get(input, 'symbol');
  const symbol = typeof symbolRaw === 'string' ? symbolRaw : '';
  const decimalsRaw = get(input, 'decimals');
  const decimals = typeof decimalsRaw === 'number' && Number.isFinite(decimalsRaw) ? decimalsRaw : 0;

  const depositFeeBps = toFiniteNumberOrUndefined(getFirstDefined(input, ['depositFeeBps', 'depositFeeBPS']));
  const withdrawFeeBps = toFiniteNumberOrUndefined(getFirstDefined(input, ['withdrawFeeBps', 'withdrawFeeBPS']));

  const transferMaxAmount = toBigintStringOrUndefined(get(input, 'transferMaxAmount'));
  const withdrawMaxAmount = toBigintStringOrUndefined(get(input, 'withdrawMaxAmount'));

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
