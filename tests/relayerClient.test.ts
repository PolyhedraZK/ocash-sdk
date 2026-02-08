import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelayerClient } from '../src/ops/relayerClient';
import { SdkError } from '../src/errors';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RelayerClient', () => {
  it('submit throws SdkError(RELAYER) on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('fail', { status: 500 })),
    );
    const client = new RelayerClient('https://relayer.example');
    await expect(client.submit({ kind: 'relayer', method: 'POST', path: '/api/v1/transfer', body: {} })).rejects.toMatchObject({
      name: 'SdkError',
      code: 'RELAYER',
    });
  });

  it('submit throws SdkError(RELAYER) when payload.code is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 123, user_message: 'bad request' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const client = new RelayerClient('https://relayer.example');
    await expect(client.submit({ kind: 'relayer', method: 'POST', path: '/api/v1/transfer', body: {} })).rejects.toMatchObject({
      name: 'SdkError',
      code: 'RELAYER',
      message: 'bad request',
    });
  });

  it('submit returns payload.data on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const client = new RelayerClient('https://relayer.example');
    await expect(client.submit({ kind: 'relayer', method: 'POST', path: '/api/v1/transfer', body: {} })).resolves.toEqual({ ok: true });
  });

  it('getTxHash throws SdkError(RELAYER) on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('fail', { status: 404 })),
    );
    const client = new RelayerClient('https://relayer.example');
    await expect(client.getTxHash({ relayerTxHash: '0x01' })).rejects.toBeInstanceOf(SdkError);
    await expect(client.getTxHash({ relayerTxHash: '0x01' })).rejects.toMatchObject({ code: 'RELAYER' });
  });

  it('getTxHash throws SdkError(RELAYER) when payload.code is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 1, message: 'not ready' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const client = new RelayerClient('https://relayer.example');
    await expect(client.getTxHash({ relayerTxHash: '0x01' })).rejects.toMatchObject({
      name: 'SdkError',
      code: 'RELAYER',
      message: 'not ready',
    });
  });

  it('getTxHash returns txhash on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: '0x0abc' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const client = new RelayerClient('https://relayer.example');
    await expect(client.getTxHash({ relayerTxHash: '0x01' })).resolves.toBe('0x0abc');
  });
});
