import { afterEach, describe, expect, it, vi } from 'vitest';
import { Utils } from '../src/utils';
import * as randomModule from '../src/utils/random';

const BABYJUB_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Utils.calcDepositFee', () => {
  it('returns zero when fee is not provided or zero', () => {
    expect(Utils.calcDepositFee(1_000_000n)).toBe(0n);
    expect(Utils.calcDepositFee(1_000_000n, 0)).toBe(0n);
  });

  it('calculates fee based on basis points', () => {
    const amount = 123_456_789n;
    expect(Utils.calcDepositFee(amount, 25)).toBe((amount * 25n) / 10_000n);
  });
});

describe('Utils.serializeBigInt', () => {
  it('stringifies bigint fields recursively', () => {
    const serialized = Utils.serializeBigInt({
      amount: 42n,
      nested: { limit: 7n },
    });
    expect(serialized).toContain('"42"');
    expect(JSON.parse(serialized)).toEqual({
      amount: '42',
      nested: { limit: '7' },
    });
  });
});

describe('random helpers', () => {
  it('randomBytes32 draws from the platform crypto API', () => {
    const stub = Uint8Array.from({ length: 32 }, (_v, i) => i);
    const crypto = globalThis.crypto;
    if (!crypto) throw new Error('Missing crypto implementation');
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (!(array instanceof Uint8Array)) {
        throw new Error('Expected Uint8Array input');
      }
      array.set(stub);
      return array;
    });
    const result = Utils.randomBytes32();
    expect(result).toHaveLength(32);
    expect(Array.from(result)).toEqual(Array.from(stub));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('randomBytes32Bigint respects whether a BabyJub scalar is requested', () => {
    const crypto = globalThis.crypto;
    if (!crypto) throw new Error('Missing crypto implementation');
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (!(array instanceof Uint8Array)) {
        throw new Error('Expected Uint8Array input');
      }
      array.fill(0xff);
      return array;
    });
    const raw = randomModule.randomBytes32Bigint();
    expect(raw).toBe(BigInt(`0x${'ff'.repeat(32)}`));
    const scalar = randomModule.randomBytes32Bigint(true);
    expect(scalar).toBe(raw % BABYJUB_ORDER);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
