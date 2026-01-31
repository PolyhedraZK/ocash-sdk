import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncEngine } from '../src/sync/syncEngine';

afterEach(() => {
  vi.useRealTimers();
});

describe('SyncEngine.start', () => {
  it('sanitizes NaN pollMs override', async () => {
    vi.useFakeTimers();

    const engine = new SyncEngine({} as any, {} as any, {} as any, () => undefined, undefined, { pollMs: 1000 });
    const syncOnceSpy = vi.fn(async () => undefined);
    (engine as any).syncOnce = syncOnceSpy;

    await expect(engine.start({ chainIds: [1], pollMs: Number.NaN })).resolves.toBeUndefined();
    expect((engine as any).timer).not.toBeNull();

    // Should tick at the normalized/default interval, not throw from NaN.
    await vi.advanceTimersByTimeAsync(999);
    expect(syncOnceSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(syncOnceSpy).toHaveBeenCalledTimes(2);

    engine.stop();
  });

  it('is idempotent and skips timer ticks while syncing', async () => {
    vi.useFakeTimers();

    const engine = new SyncEngine({} as any, {} as any, {} as any, () => undefined, undefined, { pollMs: 1000 });
    const syncOnceSpy = vi.fn(async () => undefined);
    (engine as any).syncOnce = syncOnceSpy;

    await engine.start({ chainIds: [1] });
    expect(syncOnceSpy).toHaveBeenCalledTimes(1);

    await engine.start({ chainIds: [1] });
    expect(syncOnceSpy).toHaveBeenCalledTimes(1);

    // simulate a chain currently syncing -> interval tick should be skipped (no extra call)
    (engine as any).runningChains.add(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(syncOnceSpy).toHaveBeenCalledTimes(1);

    // when idle again -> next tick triggers syncOnce
    (engine as any).runningChains.clear();
    await vi.advanceTimersByTimeAsync(999);
    expect(syncOnceSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(syncOnceSpy).toHaveBeenCalledTimes(2);

    engine.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(syncOnceSpy).toHaveBeenCalledTimes(2);
  });
});
