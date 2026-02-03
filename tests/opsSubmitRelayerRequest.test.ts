import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ops } from '../src/ops/ops';
import { TxBuilder } from '../src/tx/txBuilder';

afterEach(() => {
  vi.unstubAllGlobals();
});

const makeOps = () => new Ops({} as any, {} as any, {} as any, {} as any, new TxBuilder(), { markSpent: async () => {} }, undefined, undefined);

describe('Ops.submitRelayerRequest', () => {
  it('returns payload.data on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const ops = makeOps();
    const { result } = await ops.submitRelayerRequest({
      prepared: {
        plan: { chainId: 1 } as any,
        request: { kind: 'relayer', method: 'POST', path: '/api/v1/transfer', body: { a: 1 } },
      },
      relayerUrl: 'https://relayer.example',
      publicClient: { waitForTransactionReceipt: vi.fn(() => new Promise(() => {})) } as any,
    });
    expect(result).toEqual({ ok: true });
  });

  it('throws SdkError(RELAYER) with request context on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('fail', { status: 500 })));
    const ops = makeOps();
    await expect(
      ops.submitRelayerRequest({
        prepared: {
          plan: { chainId: 1 } as any,
          request: { kind: 'relayer', method: 'POST', path: '/api/v1/transfer', body: { a: 1 } },
        },
        relayerUrl: 'https://relayer.example',
        publicClient: { waitForTransactionReceipt: vi.fn(() => new Promise(() => {})) } as any,
      }),
    ).rejects.toMatchObject({
      name: 'SdkError',
      code: 'RELAYER',
      detail: expect.objectContaining({ relayerUrl: 'https://relayer.example' }),
    });
  });

  it('throws SdkError(RELAYER) when payload.code is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 123, user_message: 'bad request' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const ops = makeOps();
    await expect(
      ops.submitRelayerRequest({
        prepared: {
          plan: { chainId: 1 } as any,
          request: { kind: 'relayer', method: 'POST', path: '/api/v1/transfer', body: { a: 1 } },
        },
        relayerUrl: 'https://relayer.example',
        publicClient: { waitForTransactionReceipt: vi.fn(() => new Promise(() => {})) } as any,
      }),
    ).rejects.toMatchObject({
      name: 'SdkError',
      code: 'RELAYER',
      message: 'bad request',
    });
  });
});
