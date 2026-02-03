import type { Hex, RelayerRequest } from '../types';
import { SdkError } from '../errors';
import { isHexStrict } from '../utils/hex';

type ApiResponse<T> = { code?: number; message?: string; user_message?: string; data?: T };

const joinUrl = (base: string, path: string) => `${base.replace(/\/$/, '')}${path}`;

const DEFAULT_RELAYER_REQUEST_TIMEOUT_MS = 60_000;

const signalTimeout = (ms: number): AbortSignal => {
  const anyAbortSignal = AbortSignal as any;
  if (typeof anyAbortSignal?.timeout === 'function') return anyAbortSignal.timeout(ms) as AbortSignal;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error('timeout')), ms);
  controller.signal.addEventListener('abort', () => clearTimeout(t), { once: true });
  return controller.signal;
};

const signalAny = (signals: Array<AbortSignal | undefined>): AbortSignal | undefined => {
  const list = signals.filter(Boolean) as AbortSignal[];
  if (!list.length) return undefined;
  const anyAbortSignal = AbortSignal as any;
  if (typeof anyAbortSignal?.any === 'function') return anyAbortSignal.any(list) as AbortSignal;
  const controller = new AbortController();
  const onAbort = (s: AbortSignal) => controller.abort((s as any).reason);
  for (const s of list) {
    if (s.aborted) {
      onAbort(s);
      break;
    }
    s.addEventListener('abort', () => onAbort(s), { once: true });
  }
  return controller.signal;
};

export class RelayerClient {
  constructor(private readonly baseUrl: string) {}

  async submit<T = unknown>(request: RelayerRequest, options?: { signal?: AbortSignal; requestTimeoutMs?: number }): Promise<T> {
    const url = joinUrl(this.baseUrl, request.path);
    const requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_RELAYER_REQUEST_TIMEOUT_MS;
    const signal = signalAny([options?.signal, signalTimeout(requestTimeoutMs)]);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request.body),
      signal,
    });
    if (!res.ok) {
      throw new SdkError('RELAYER', 'Relayer request failed', { status: res.status, method: 'POST', url });
    }
    const payload = (await res.json()) as ApiResponse<T>;
    if (payload?.code) {
      throw new SdkError('RELAYER', payload.user_message || payload.message || 'Relayer request failed', payload);
    }
    return payload.data as T;
  }

  async getTxHash(input: { relayerTxHash: Hex; signal?: AbortSignal; requestTimeoutMs?: number }): Promise<Hex | null> {
    const url = new URL(joinUrl(this.baseUrl, '/api/v1/txhash'));
    url.searchParams.set('txhash', input.relayerTxHash);
    const requestTimeoutMs = input.requestTimeoutMs ?? DEFAULT_RELAYER_REQUEST_TIMEOUT_MS;
    const signal = signalAny([input.signal, signalTimeout(requestTimeoutMs)]);
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) {
      throw new SdkError('RELAYER', 'Relayer txhash request failed', { status: res.status, method: 'GET', url: url.toString() });
    }
    const payload = (await res.json()) as ApiResponse<Hex>;
    if (payload?.code) {
      throw new SdkError('RELAYER', payload.user_message || payload.message || 'Relayer request failed', payload);
    }
    if (payload.data == null) return null;
    if (!isHexStrict(payload.data, { minBytes: 1 })) {
      throw new SdkError('RELAYER', 'Invalid relayer txhash', { txhash: payload.data, url: url.toString() });
    }
    return payload.data as Hex;
  }
}
