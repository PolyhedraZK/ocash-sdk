import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ops } from '../src/ops/ops';
import { TxBuilder } from '../src/tx/txBuilder';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const makeOps = () =>
  new Ops(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    new TxBuilder(),
    { markSpent: async () => {} },
    undefined,
    undefined,
  );

describe('Ops.waitRelayerTxHash', () => {
  it('throws SdkError(RELAYER) on timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const ops = makeOps();
    const task = expect(
      ops.waitRelayerTxHash({
        relayerUrl: 'https://relayer.example',
        relayerTxHash: '0x01',
        timeoutMs: 10,
        intervalMs: 5,
      }),
    ).rejects.toMatchObject({ name: 'SdkError', code: 'RELAYER', message: 'waitRelayerTxHash timeout' });

    await vi.advanceTimersByTimeAsync(20);
    await task;
  });

  it('throws SdkError(RELAYER) when aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('stop'));

    const ops = makeOps();
    await expect(
      ops.waitRelayerTxHash({
        relayerUrl: 'https://relayer.example',
        relayerTxHash: '0x01',
        timeoutMs: 1000,
        intervalMs: 1,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'SdkError', code: 'RELAYER', message: 'waitRelayerTxHash aborted' });
  });

  it('returns txhash when relayer provides it', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        const body = calls === 1 ? { data: null } : { data: '0x0abc' };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );

    const ops = makeOps();
    await expect(
      ops.waitRelayerTxHash({
        relayerUrl: 'https://relayer.example',
        relayerTxHash: '0x01',
        timeoutMs: 1000,
        intervalMs: 1,
      }),
    ).resolves.toBe('0x0abc');
  });
});
