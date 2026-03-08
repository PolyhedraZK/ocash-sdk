import { describe, expect, it } from 'vitest';
import { bigintReplacer, serializeBigInt, stableStringify } from '../src/utils/json';

describe('bigintReplacer', () => {
  it('converts bigint to string', () => {
    expect(bigintReplacer('x', 42n)).toBe('42');
  });

  it('passes non-bigint values through', () => {
    expect(bigintReplacer('x', 'hello')).toBe('hello');
    expect(bigintReplacer('x', 99)).toBe(99);
    expect(bigintReplacer('x', null)).toBe(null);
  });
});

describe('serializeBigInt', () => {
  it('serializes objects with bigint fields', () => {
    const result = serializeBigInt({ a: 1n, b: 'text' });
    expect(JSON.parse(result)).toEqual({ a: '1', b: 'text' });
  });
});

describe('stableStringify', () => {
  it('sorts object keys for deterministic output', () => {
    const a = stableStringify({ z: 1, a: 2 });
    const b = stableStringify({ a: 2, z: 1 });
    expect(a).toBe(b);
    expect(JSON.parse(a)).toEqual({ a: 2, z: 1 });
  });

  it('handles nested objects with sorted keys', () => {
    const result = stableStringify({ b: { d: 1, c: 2 }, a: 3 });
    const keys = Object.keys(JSON.parse(result));
    expect(keys).toEqual(['a', 'b']);
  });

  it('handles arrays without reordering', () => {
    const result = stableStringify([3, 1, 2]);
    expect(JSON.parse(result)).toEqual([3, 1, 2]);
  });

  it('converts bigint values', () => {
    const result = stableStringify({ amount: 100n });
    expect(JSON.parse(result)).toEqual({ amount: '100' });
  });

  it('strips undefined values', () => {
    const result = stableStringify({ a: 1, b: undefined });
    expect(JSON.parse(result)).toEqual({ a: 1 });
  });

  it('handles null and primitives', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('hi')).toBe('"hi"');
  });
});
