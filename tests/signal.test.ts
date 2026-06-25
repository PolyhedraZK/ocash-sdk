import { describe, expect, it } from 'vitest';
import { signalTimeout, signalAny } from '../src/utils/signal';

describe('signalTimeout', () => {
  it('returns an AbortSignal', () => {
    const signal = signalTimeout(5_000);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('aborts after the specified timeout', async () => {
    const signal = signalTimeout(50);
    expect(signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    expect(signal.aborted).toBe(true);
  });
});

describe('signalAny', () => {
  it('returns undefined for empty input', () => {
    expect(signalAny([])).toBeUndefined();
  });

  it('returns undefined when all entries are undefined', () => {
    expect(signalAny([undefined, undefined])).toBeUndefined();
  });

  it('aborts when any input signal aborts', () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    const combined = signalAny([c1.signal, c2.signal]);
    expect(combined).toBeDefined();
    expect(combined!.aborted).toBe(false);

    c1.abort(new Error('first'));
    expect(combined!.aborted).toBe(true);
  });

  it('is already aborted if an input signal is pre-aborted', () => {
    const c = new AbortController();
    c.abort(new Error('already'));
    const combined = signalAny([c.signal]);
    expect(combined!.aborted).toBe(true);
  });
});
