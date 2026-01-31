import type { Hex, SdkEvent } from '../types';
import { SdkError } from '../errors';
import { isHexStrict } from '../utils/hex';
import { errorToDebug, nonOkResponseDetail } from '../utils/httpDebug';

export interface EntryMemo {
  commitment: Hex;
  memo: Hex;
  cid: number | null;
  created_at?: number | null;
}

export interface EntryNullifier {
  nullifier: Hex;
  created_at?: number | null;
}

interface EntryListResponse<T> {
  code?: number;
  message?: string;
  data?: { data?: T[]; total?: number } | { data?: T[]; total?: number; ready?: boolean };
}

const joinUrl = (base: string, path: string) => `${base.replace(/\/$/, '')}${path}`;

const withQuery = (url: string, params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
};

const isHex = (value: unknown): value is Hex => isHexStrict(value);

const normalizeTotal = (value: unknown): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
};

const normalizeMemoEntry = (raw: any): EntryMemo => {
  if (!raw || typeof raw !== 'object') {
    throw new SdkError('SYNC', 'Invalid entry memo item', { item: raw });
  }
  if (!isHex(raw.commitment)) throw new SdkError('SYNC', 'Invalid entry memo commitment', { commitment: raw.commitment });
  if (!isHex(raw.memo)) throw new SdkError('SYNC', 'Invalid entry memo payload', { memo: raw.memo });
  const cid = raw.cid;
  if (cid != null && !(typeof cid === 'number' && Number.isInteger(cid) && cid >= 0)) {
    throw new SdkError('SYNC', 'Invalid entry memo cid', { cid });
  }
  const createdAt = raw.created_at;
  if (createdAt != null && !(typeof createdAt === 'number' && Number.isInteger(createdAt) && createdAt >= 0)) {
    throw new SdkError('SYNC', 'Invalid entry memo created_at', { created_at: createdAt });
  }
  return { commitment: raw.commitment, memo: raw.memo, cid: cid ?? null, created_at: createdAt ?? null };
};

const normalizeNullifierEntry = (raw: any): EntryNullifier => {
  if (!raw || typeof raw !== 'object') {
    throw new SdkError('SYNC', 'Invalid entry nullifier item', { item: raw });
  }
  if (!isHex(raw.nullifier)) throw new SdkError('SYNC', 'Invalid entry nullifier', { nullifier: raw.nullifier });
  const createdAt = raw.created_at;
  if (createdAt != null && !(typeof createdAt === 'number' && Number.isInteger(createdAt) && createdAt >= 0)) {
    throw new SdkError('SYNC', 'Invalid entry nullifier created_at', { created_at: createdAt });
  }
  return { nullifier: raw.nullifier, created_at: createdAt ?? null };
};

const unwrapList = <T>(payload: EntryListResponse<T>, detail: Record<string, unknown>) => {
  if (typeof payload?.code === 'number' && payload.code !== 0) {
    throw new SdkError('SYNC', payload.message || 'EntryService request failed', payload);
  }
  const itemsRaw = (payload as any)?.data?.data;
  const totalRaw = (payload as any)?.data?.total;
  if (itemsRaw != null && !Array.isArray(itemsRaw)) {
    throw new SdkError('SYNC', 'Invalid entry response: data.data must be an array', { ...detail, data: (payload as any)?.data });
  }
  return { items: (itemsRaw ?? []) as T[], total: normalizeTotal(totalRaw) };
};

const unwrapListWithReady = <T>(payload: EntryListResponse<T>, detail: Record<string, unknown>) => {
  const base = unwrapList(payload, detail);
  const ready = (payload as any)?.data?.ready;
  return { ...base, ready: ready == null ? true : Boolean(ready) };
};

type DebugEmitter = (event: Extract<SdkEvent, { type: 'debug' }>) => void;

export class EntryClient {
  constructor(
    private readonly baseUrl: string,
    private readonly debugEmit?: DebugEmitter,
  ) {}

  async listMemos(input: { chainId: number; address: string; offset: number; limit: number; signal?: AbortSignal }) {
    const url = withQuery(joinUrl(this.baseUrl, '/api/v1/viewing/memos/list'), {
      offset: input.offset,
      limit: input.limit,
      chain_id: input.chainId,
      address: input.address,
      order: 'asc',
    });
    this.debugEmit?.({
      type: 'debug',
      payload: { scope: 'http:entry', message: 'request', detail: { method: 'GET', url } },
    });
    let response: Response;
    try {
      response = await fetch(url, { signal: input.signal });
    } catch (error) {
      this.debugEmit?.({ type: 'debug', payload: { scope: 'http:entry', message: 'network_error', detail: { url, error: errorToDebug(error) } } });
      throw error;
    }
    this.debugEmit?.({
      type: 'debug',
      payload: { scope: 'http:entry', message: 'response', detail: { url, status: response.status, ok: response.ok } },
    });
    if (!response.ok) {
      throw new SdkError('SYNC', 'EntryService memos request failed', await nonOkResponseDetail(response, url));
    }
    const payload = (await response.json()) as EntryListResponse<EntryMemo>;
    const { items, total } = unwrapList(payload, { url });
    return { items: items.map(normalizeMemoEntry), total };
  }

  async listNullifiers(input: { chainId: number; address: string; offset: number; limit: number; signal?: AbortSignal }) {
    const url = withQuery(joinUrl(this.baseUrl, '/api/v1/viewing/nullifier/list'), {
      offset: input.offset,
      limit: input.limit,
      chain_id: input.chainId,
      address: input.address,
      order: 'asc',
    });
    this.debugEmit?.({
      type: 'debug',
      payload: { scope: 'http:entry', message: 'request', detail: { method: 'GET', url } },
    });
    let response: Response;
    try {
      response = await fetch(url, { signal: input.signal });
    } catch (error) {
      this.debugEmit?.({ type: 'debug', payload: { scope: 'http:entry', message: 'network_error', detail: { url, error: errorToDebug(error) } } });
      throw error;
    }
    this.debugEmit?.({
      type: 'debug',
      payload: { scope: 'http:entry', message: 'response', detail: { url, status: response.status, ok: response.ok } },
    });
    if (!response.ok) {
      throw new SdkError('SYNC', 'EntryService nullifier request failed', await nonOkResponseDetail(response, url));
    }
    const payload = (await response.json()) as EntryListResponse<EntryNullifier>;
    const { items, total } = unwrapList(payload, { url });
    return { items: items.map(normalizeNullifierEntry), total };
  }

  async listNullifiersByBlock(input: { chainId: number; address: string; offset: number; limit: number; signal?: AbortSignal }) {
    const url = withQuery(joinUrl(this.baseUrl, '/api/v1/viewing/nullifier/list_by_block'), {
      offset: input.offset,
      limit: input.limit,
      chain_id: input.chainId,
      address: input.address,
      order: 'asc',
    });
    this.debugEmit?.({
      type: 'debug',
      payload: { scope: 'http:entry', message: 'request', detail: { method: 'GET', url } },
    });
    let response: Response;
    try {
      response = await fetch(url, { signal: input.signal });
    } catch (error) {
      this.debugEmit?.({ type: 'debug', payload: { scope: 'http:entry', message: 'network_error', detail: { url, error: errorToDebug(error) } } });
      throw error;
    }
    this.debugEmit?.({
      type: 'debug',
      payload: { scope: 'http:entry', message: 'response', detail: { url, status: response.status, ok: response.ok } },
    });
    if (!response.ok) {
      throw new SdkError('SYNC', 'EntryService nullifier list_by_block request failed', await nonOkResponseDetail(response, url));
    }
    const payload = (await response.json()) as EntryListResponse<EntryNullifier>;
    const { items, total, ready } = unwrapListWithReady(payload, { url });
    return { items: items.map(normalizeNullifierEntry), total, ready };
  }
}
