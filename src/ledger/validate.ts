import type { Address } from 'viem';
import type { ChainConfigInput, TokenMetadata } from '../types';
import { SdkError } from '../errors';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

const isAddress = (value: unknown): value is Address => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);

/**
 * Assert helpers for runtime validation of config inputs.
 */
const assertArray = (value: unknown, name: string): unknown[] => {
  if (!Array.isArray(value)) throw new SdkError('CONFIG', `Invalid ${name}: expected array`, { value });
  return value;
};

const assertString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.length) throw new SdkError('CONFIG', `Invalid ${name}: expected non-empty string`, { value });
  return value;
};

const assertOptionalString = (value: unknown, name: string): string | undefined => {
  if (value == null) return undefined;
  if (typeof value !== 'string') throw new SdkError('CONFIG', `Invalid ${name}: expected string`, { value });
  return value;
};

const assertNumber = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new SdkError('CONFIG', `Invalid ${name}: expected number`, { value });
  return value;
};

const assertOptionalBps = (value: unknown, name: string): number | undefined => {
  if (value == null) return undefined;
  const n = assertNumber(value, name);
  const i = Math.floor(n);
  if (i !== n) throw new SdkError('CONFIG', `Invalid ${name}: expected integer`, { value });
  if (i < 0 || i > 10000) throw new SdkError('CONFIG', `Invalid ${name}: expected 0..10000`, { value });
  return i;
};

const assertBigIntString = (value: unknown, name: string): string => {
  const s = assertString(value, name);
  try {
    BigInt(s);
  } catch (error) {
    throw new SdkError('CONFIG', `Invalid ${name}: expected bigint decimal string`, { value }, error);
  }
  return s;
};

const assertOptionalBigintLike = (value: unknown, name: string): bigint | string | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string') {
    try {
      BigInt(value);
      return value;
    } catch (error) {
      throw new SdkError('CONFIG', `Invalid ${name}: expected bigint|string`, { value }, error);
    }
  }
  throw new SdkError('CONFIG', `Invalid ${name}: expected bigint|string`, { value });
};

const assertBigintPairStrings = (value: unknown, name: string): [string, string] => {
  const arr = assertArray(value, name);
  if (arr.length !== 2) throw new SdkError('CONFIG', `Invalid ${name}: expected [x,y]`, { value });
  return [assertBigIntString(arr[0], `${name}[0]`), assertBigIntString(arr[1], `${name}[1]`)];
};

/**
 * Validate token metadata input at runtime. Throws SdkError on mismatch.
 */
export function assertTokenMetadata(value: unknown, name = 'token'): asserts value is TokenMetadata {
  if (!isRecord(value)) throw new SdkError('CONFIG', `Invalid ${name}: expected object`, { value });
  const token = value;

  const id = assertString(token.id, `${name}.id`);
  const wrapped = token.wrappedErc20;
  if (!isAddress(wrapped)) throw new SdkError('CONFIG', `Invalid ${name}.wrappedErc20: expected EVM address`, { value: wrapped });

  const viewerPk = token.viewerPk;
  const freezerPk = token.freezerPk;
  assertBigintPairStrings(viewerPk, `${name}.viewerPk`);
  assertBigintPairStrings(freezerPk, `${name}.freezerPk`);

  const symbol = token.symbol;
  if (typeof symbol !== 'string') throw new SdkError('CONFIG', `Invalid ${name}.symbol: expected string`, { value: symbol });

  const decimals = token.decimals;
  const decimalsNum = assertNumber(decimals, `${name}.decimals`);
  const decimalsInt = Math.floor(decimalsNum);
  if (decimalsInt !== decimalsNum || decimalsInt < 0 || decimalsInt > 255) {
    throw new SdkError('CONFIG', `Invalid ${name}.decimals: expected uint8`, { value: decimals });
  }

  assertOptionalBps(token.depositFeeBps, `${name}.depositFeeBps`);
  assertOptionalBps(token.withdrawFeeBps, `${name}.withdrawFeeBps`);
  assertOptionalBigintLike(token.transferMaxAmount, `${name}.transferMaxAmount`);
  assertOptionalBigintLike(token.withdrawMaxAmount, `${name}.withdrawMaxAmount`);

  // id is used as a string key; keep it stable.
  if (!id.length) throw new SdkError('CONFIG', `Invalid ${name}.id`, { value: token.id });
}

/**
 * Validate a list of tokens.
 */
export function assertTokenList(value: unknown, name = 'tokens'): asserts value is TokenMetadata[] {
  const arr = assertArray(value, name);
  for (let i = 0; i < arr.length; i++) {
    assertTokenMetadata(arr[i], `${name}[${i}]`);
  }
}

/**
 * Validate a chain config input at runtime. Throws SdkError on mismatch.
 */
export function assertChainConfigInput(value: unknown, name = 'chain'): asserts value is ChainConfigInput {
  if (!isRecord(value)) throw new SdkError('CONFIG', `Invalid ${name}: expected object`, { value });
  const chain = value;

  assertNumber(chain.chainId, `${name}.chainId`);
  assertOptionalString(chain.rpcUrl, `${name}.rpcUrl`);
  assertOptionalString(chain.entryUrl, `${name}.entryUrl`);
  assertOptionalString(chain.relayerUrl, `${name}.relayerUrl`);
  assertOptionalString(chain.merkleProofUrl, `${name}.merkleProofUrl`);

  const contract = chain.contract;
  if (contract != null && !isAddress(contract)) throw new SdkError('CONFIG', `Invalid ${name}.contract: expected address`, { value: contract });
  const ocashContractAddress = chain.ocashContractAddress;
  if (ocashContractAddress != null && !isAddress(ocashContractAddress)) {
    throw new SdkError('CONFIG', `Invalid ${name}.ocashContractAddress: expected address`, { value: ocashContractAddress });
  }

  if (chain.tokens != null) assertTokenList(chain.tokens, `${name}.tokens`);
}
