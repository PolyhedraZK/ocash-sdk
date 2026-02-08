import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ops } from '../src/ops/ops';
import { TxBuilder } from '../src/tx/txBuilder';

afterEach(() => {
  vi.unstubAllGlobals();
});

const makePlan = () => ({
  chainId: 1,
  action: 'withdraw' as const,
  assetId: 'eth',
  selectedInput: { commitment: '0x01' },
  outputRecordOpening: { asset_amount: 0n },
  feeSummary: { relayerFeeTotal: 0n, protocolFeeTotal: 0n, mergeCount: 0, feeCount: 0 },
  token: { symbol: 'ETH' },
  requestedAmount: 0n,
  burnAmount: 0n,
  protocolFee: 0n,
  relayerFee: 0n,
  recipient: '0x0000000000000000000000000000000000000000',
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
        plan: makePlan() as any,
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
          plan: makePlan() as any,
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
          plan: makePlan() as any,
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
