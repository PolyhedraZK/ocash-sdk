import type { Hex, RelayerRequest } from '../types';
import { SdkError } from '../errors';
import { isHexStrict } from '../utils/hex';
import { signalTimeout, signalAny } from '../utils/signal';
import { joinUrl } from '../utils/url';

type ApiResponse<T> = { code?: number; message?: string; user_message?: string; data?: T };

const DEFAULT_RELAYER_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Lightweight HTTP client for relayer endpoints.
 */
export class RelayerClient {
  constructor(private readonly baseUrl: string) {}

  /**
   * Submit a relayer request and return the parsed response data.
   */
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

  /**
   * Poll the relayer for the on-chain tx hash corresponding to a relayer tx hash.
   */
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
