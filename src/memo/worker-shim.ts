import { MemoKit } from './memoKit';
import type { MemoDecryptRequest, MemoDecryptResult } from '../types';

export interface WorkerBatchRequest {
  secretKey: string;
  memos: { index: number; memo: string }[];
}

export interface WorkerMessage {
  id: string;
  type: 'DECRYPT_MEMOS';
  data: WorkerBatchRequest;
}

export interface WorkerResponse {
  id: string;
  type: 'success' | 'error';
  data?: { index: number; record?: MemoDecryptResult['record']; error?: string }[];
  error?: string;
}

export type WorkerCtor = new () => Worker;

export class MemoWorkerShim {
  constructor(private readonly ctor: WorkerCtor) {}

  create() {
    return new this.ctor();
  }
}

export const createMessage = (id: string, payload: WorkerBatchRequest): WorkerMessage => ({
  id,
  type: 'DECRYPT_MEMOS',
  data: payload,
});

export const handleDecrypt = (payload: WorkerBatchRequest): WorkerResponse['data'] => {
  const secretKey = BigInt(payload.secretKey);
  return payload.memos.map((entry) => {
    try {
      const record = MemoKit.decryptMemo(secretKey, entry.memo as `0x${string}`);
      return { index: entry.index, record };
    } catch (error) {
      return {
        index: entry.index,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
};
