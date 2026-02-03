import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ops } from '../src/ops/ops';
import { TxBuilder } from '../src/tx/txBuilder';
import { MemoryStore } from '../src/store/memoryStore';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const makeOps = (store: MemoryStore) =>
  new Ops({} as any, {} as any, {} as any, {} as any, new TxBuilder(), { markSpent: async () => {} }, store);

describe('Ops operation tracking', () => {
  it('creates and updates operation on submitRelayerRequest when operation is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: '0x0aaa' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const store = new MemoryStore();
    const ops = makeOps(store);
    const { result, operationId } = await ops.submitRelayerRequest({
      prepared: {
        plan: { chainId: 1 } as any,
        request: { kind: 'relayer', method: 'POST', path: '/api/v1/transfer', body: { a: 1 } },
      },
      relayerUrl: 'https://relayer.example',
      operation: { type: 'transfer', chainId: 1 },
      publicClient: { waitForTransactionReceipt: vi.fn(() => new Promise(() => {})) } as any,
    });

    expect(result).toBe('0x0aaa');
    expect(operationId).toBeTruthy();
    const updated = store.listOperations(1)[0]!;
    expect(updated.id).toBe(operationId);
    expect(updated.status).toBe('submitted');
    expect(updated.requestUrl).toBe('https://relayer.example/api/v1/transfer');
    expect(updated.relayerTxHash).toBe('0x0aaa');
  });

  it('updates operation to submitted with txHash when waitRelayerTxHash resolves', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        const body = calls === 1 ? { data: null } : { data: '0x0abc' };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );

    const store = new MemoryStore();
    const op = store.createOperation({ type: 'transfer', chainId: 1, status: 'submitted', relayerTxHash: '0x01' });
    const ops = makeOps(store);

    const task = ops.waitRelayerTxHash({
      relayerUrl: 'https://relayer.example',
      relayerTxHash: '0x01',
      timeoutMs: 1000,
      intervalMs: 10,
      operationId: op.id,
    });

    await vi.advanceTimersByTimeAsync(20);
    await expect(task).resolves.toBe('0x0abc');

    const updated = store.listOperations(1)[0]!;
    expect(updated.id).toBe(op.id);
    expect(updated.status).toBe('submitted');
    expect(updated.txHash).toBe('0x0abc');
  });

  it('updates operation to confirmed when waitForTransactionReceipt succeeds', async () => {
    const store = new MemoryStore();
    const op = store.createOperation({ type: 'transfer', chainId: 1, status: 'submitted', relayerTxHash: '0x01', txHash: '0x0abc' });
    const ops = makeOps(store);
    const publicClient = {
      waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
    } as any;

    await expect(
      ops.waitForTransactionReceipt({
        publicClient,
        txHash: '0x0abc',
        timeoutMs: 1000,
        pollIntervalMs: 10,
        operationId: op.id,
      }),
    ).resolves.toMatchObject({ status: 'success' });

    const updated = store.listOperations(1)[0]!;
    expect(updated.id).toBe(op.id);
    expect(updated.status).toBe('confirmed');
    expect(updated.txHash).toBe('0x0abc');
  });

  it('updates operation to failed with requestUrl when waitRelayerTxHash is aborted', async () => {
    const store = new MemoryStore();
    const op = store.createOperation({ type: 'transfer', chainId: 1, status: 'submitted', relayerTxHash: '0x01' });
    const ops = makeOps(store);

    const controller = new AbortController();
    controller.abort(new Error('stop'));

    await expect(
      ops.waitRelayerTxHash({
        relayerUrl: 'https://relayer.example',
        relayerTxHash: '0x01',
        timeoutMs: 1000,
        intervalMs: 10,
        operationId: op.id,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'SdkError', code: 'RELAYER', message: 'waitRelayerTxHash aborted' });

    const updated = store.listOperations(1)[0]!;
    expect(updated.id).toBe(op.id);
    expect(updated.status).toBe('failed');
    expect(updated.requestUrl).toBe('https://relayer.example');
  });

  it('updates operation to failed with error details when waitRelayerTxHash polling fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    const store = new MemoryStore();
    const op = store.createOperation({ type: 'transfer', chainId: 1, status: 'submitted', relayerTxHash: '0x01' });
    const ops = makeOps(store);

    await expect(
      ops.waitRelayerTxHash({
        relayerUrl: 'https://relayer.example',
        relayerTxHash: '0x01',
        timeoutMs: 1000,
        intervalMs: 10,
        operationId: op.id,
      }),
    ).rejects.toMatchObject({ name: 'SdkError', code: 'RELAYER', message: 'waitRelayerTxHash polling failed' });

    const updated = store.listOperations(1)[0]!;
    expect(updated.id).toBe(op.id);
    expect(updated.status).toBe('failed');
    expect(updated.requestUrl).toBe('https://relayer.example');
    expect(updated.error).toBeTruthy();
  });
});
