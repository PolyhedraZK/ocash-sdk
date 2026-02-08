import { SdkError } from '../errors';
import type { RemoteMerkleProofResponse, SdkEvent } from '../types';
import { errorToDebug, nonOkResponseDetail } from '../utils/httpDebug';
import { signalTimeout, signalAny } from '../utils/signal';
import { joinUrl } from '../utils/url';

const DEFAULT_MERKLE_REQUEST_TIMEOUT_MS = 15_000;

const withRepeatedQuery = (url: string, key: string, values: Array<string | number>) => {
  const search = new URLSearchParams();
  for (const v of values) search.append(key, String(v));
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
};

const normalizeLatestCid = (value: unknown): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n) || n < 0) {
    throw new SdkError('MERKLE', 'Invalid merkle latest_cid', { latest_cid: value });
  }
  return Math.floor(n);
};

const normalizePathEntry = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  throw new SdkError('MERKLE', 'Invalid merkle proof path entry', { value });
};

const normalizeLeafIndex = (value: unknown): string | number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length) return value;
  throw new SdkError('MERKLE', 'Invalid merkle leaf_index', { leaf_index: value });
};

const normalizeMerkleRoot = (value: unknown): string => {
  if (typeof value === 'string' && value.length) {
    try {
      // allow both 0x... and decimal-like strings
      void BigInt(value);
      return value;
    } catch {
      throw new SdkError('MERKLE', 'Invalid merkle_root', { merkle_root: value });
    }
  }
  if (typeof value === 'bigint') return value.toString();
  throw new SdkError('MERKLE', 'Invalid merkle_root', { merkle_root: value });
};

const normalizeResponse = (raw: unknown): RemoteMerkleProofResponse => {
  if (!raw || typeof raw !== 'object') {
    throw new SdkError('MERKLE', 'Invalid merkle proof response', { raw });
  }
  const obj = raw as any;
  const proofRaw = obj.proof;
  if (!Array.isArray(proofRaw)) {
    throw new SdkError('MERKLE', 'Invalid merkle proof response: missing proof[]', { raw });
  }
  const proof = proofRaw.map((entry: any, idx: number) => {
    if (!entry || typeof entry !== 'object') {
      throw new SdkError('MERKLE', 'Invalid merkle proof entry', { index: idx, entry });
    }
    if (!Array.isArray(entry.path)) {
      throw new SdkError('MERKLE', 'Invalid merkle proof entry: missing path[]', { index: idx, entry });
    }
    return {
      path: entry.path.map(normalizePathEntry),
      leaf_index: normalizeLeafIndex(entry.leaf_index),
    };
  });

  return {
    proof,
    merkle_root: normalizeMerkleRoot(obj.merkle_root),
    latest_cid: normalizeLatestCid(obj.latest_cid),
  } as RemoteMerkleProofResponse;
};

type DebugEmitter = (event: Extract<SdkEvent, { type: 'debug' }>) => void;

export class MerkleClient {
  constructor(
    private readonly baseUrl: string,
    private readonly debugEmit?: DebugEmitter,
  ) {}

  async getProofByCids(
    cids: number[],
    options?: { signal?: AbortSignal; requestTimeoutMs?: number },
  ): Promise<RemoteMerkleProofResponse> {
    if (!Array.isArray(cids) || cids.length === 0) {
      throw new SdkError('MERKLE', 'Merkle proof requires at least one cid', { cids });
    }
    const url = withRepeatedQuery(joinUrl(this.baseUrl, '/api/v1/merkle'), 'cid', cids);
    this.debugEmit?.({ type: 'debug', payload: { scope: 'http:merkle', message: 'request', detail: { method: 'GET', url } } });
    let response: Response;
    const requestTimeoutMs =
      typeof options?.requestTimeoutMs === 'number' && Number.isFinite(options.requestTimeoutMs)
        ? Math.max(1000, Math.floor(options.requestTimeoutMs))
        : DEFAULT_MERKLE_REQUEST_TIMEOUT_MS;
    const signal = signalAny([options?.signal, signalTimeout(requestTimeoutMs)]);
    try {
      response = await fetch(url, { signal });
    } catch (error) {
      this.debugEmit?.({ type: 'debug', payload: { scope: 'http:merkle', message: 'network_error', detail: { url, error: errorToDebug(error) } } });
      throw new SdkError(
        'MERKLE',
        'Merkle proof request failed',
        { url, reason: 'network_error', requestTimeoutMs },
        error,
      );
    }
    this.debugEmit?.({
      type: 'debug',
      payload: { scope: 'http:merkle', message: 'response', detail: { url, status: response.status, ok: response.ok } },
    });
    if (!response.ok) {
      throw new SdkError('MERKLE', 'Merkle proof request failed', await nonOkResponseDetail(response, url));
    }
    const json = await response.json();
    return normalizeResponse(json);
  }
}
