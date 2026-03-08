import { describe, expect, it } from 'vitest';
import { toBigintOrThrow } from '../src/utils/bigint';
import { SdkError } from '../src/errors';

const ctx = { code: 'CONFIG' as const, name: 'amount', detail: {} };

describe('toBigintOrThrow', () => {
  it('passes through bigint values', () => {
    expect(toBigintOrThrow(42n, ctx)).toBe(42n);
    expect(toBigintOrThrow(0n, ctx)).toBe(0n);
  });

  it('converts numeric strings', () => {
    expect(toBigintOrThrow('123', ctx)).toBe(123n);
    expect(toBigintOrThrow('0', ctx)).toBe(0n);
  });

  it('converts finite numbers', () => {
    expect(toBigintOrThrow(100, ctx)).toBe(100n);
    expect(toBigintOrThrow(0, ctx)).toBe(0n);
  });

  it('throws SdkError for invalid input', () => {
    expect(() => toBigintOrThrow('not-a-number', ctx)).toThrow(SdkError);
    expect(() => toBigintOrThrow(null, ctx)).toThrow(SdkError);
    expect(() => toBigintOrThrow(undefined, ctx)).toThrow(SdkError);
    expect(() => toBigintOrThrow({}, ctx)).toThrow(SdkError);
  });

  it('includes field name in error message', () => {
    try {
      toBigintOrThrow('bad', ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(SdkError);
      expect((err as SdkError).message).toContain('amount');
      expect((err as SdkError).code).toBe('CONFIG');
    }
  });
});
