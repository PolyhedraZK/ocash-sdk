import { MemoKit } from './memoKit';
import type { CommitmentData, MemoDecryptRequest, MemoDecryptResult, MemoWorkerConfig } from '../types';
import { SdkError } from '../errors';

const DEFAULT_CONCURRENCY = typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number' ? Math.max(1, Math.floor(navigator.hardwareConcurrency / 2)) : 2;

interface WorkerMessageResult {
  index: number;
  record?: CommitmentData | null;
  error?: string;
}

interface WorkerResponsePayload {
  id: string;
  type: 'success' | 'error';
  data?: WorkerMessageResult[];
  error?: string;
}

export class MemoWorker {
  private worker: Worker | null = null;
  private readonly pending = new Map<
    string,
    { resolve: (value: MemoDecryptResult[]) => void; reject: (error: Error) => void; chunk: MemoDecryptRequest[] }
  >();
  private messageId = 0;
  private readonly config: MemoWorkerConfig;

  constructor(config?: MemoWorkerConfig) {
    this.config = config ?? {};
  }

  private get concurrency() {
    return this.config.concurrency ?? DEFAULT_CONCURRENCY;
  }

  private ensureWorker() {
    if (this.worker || typeof Worker === 'undefined') return;
    const workerUrl = this.config.workerUrl;
    if (!workerUrl) {
      throw new SdkError('CONFIG', 'Memo worker requires workerUrl configuration');
    }
    this.worker = new Worker(workerUrl, { type: this.config.type ?? 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponsePayload>) => {
      const payload = event.data;
      const pending = this.pending.get(payload.id);
      if (!pending) return;
      this.pending.delete(payload.id);
      if (payload.type === 'success' && payload.data) {
        const normalized = payload.data.map((entry) => this.normalizeWorkerResult(entry, pending.chunk));
        pending.resolve(normalized);
      } else {
        pending.reject(new Error(payload.error || 'Memo worker error'));
      }
    };
    this.worker.onerror = (error) => {
      this.pending.forEach(({ reject }) => reject(error instanceof Error ? error : new Error(String(error))));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
  }

  private normalizeWorkerResult(entry: WorkerMessageResult, chunk: MemoDecryptRequest[]): MemoDecryptResult {
    const source = chunk[entry.index];
    return {
      memo: source?.memo ?? ('0x' as `0x${string}`),
      record: entry.record ?? null,
      metadata: source?.metadata,
      error: entry.error ? { message: entry.error } : undefined,
    };
  }

  private dispatch(secretKey: bigint, chunk: MemoDecryptRequest[]): Promise<MemoDecryptResult[]> {
    this.ensureWorker();
    const worker = this.worker;
    if (!worker) {
      return Promise.reject(new SdkError('CRYPTO', 'Memo worker not available'));
    }
    const id = `memo_${++this.messageId}`;
    const payload = {
      id,
      type: 'DECRYPT_MEMOS',
      data: {
        secretKey: secretKey.toString(),
        memos: chunk.map((entry, index) => ({ index, memo: entry.memo })),
      },
    };
    return new Promise<MemoDecryptResult[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new SdkError('CRYPTO', 'Memo worker timeout'));
      }, 120000);
      this.pending.set(id, {
        chunk,
        resolve: (result) => {
          clearTimeout(timeout);
          const merged = result.map((entry, index) => {
            const source = chunk[index];
            const errorMessage = entry.error?.message;
            return {
              memo: source.memo,
              record: entry.record ?? null,
              metadata: source.metadata,
              error: errorMessage ? { message: errorMessage } : undefined,
            };
          });
          resolve(merged);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      worker.postMessage(payload);
    });
  }

  private async decryptWithKey(secretKey: bigint, requests: MemoDecryptRequest[]): Promise<MemoDecryptResult[]> {
    if (!this.config.workerUrl || typeof Worker === 'undefined') {
      return requests.map((req) => this.decryptSingle(secretKey, req));
    }
    const chunkSize = Math.max(1, Math.ceil(requests.length / this.concurrency));
    const batches: Promise<MemoDecryptResult[]>[] = [];
    for (let i = 0; i < requests.length; i += chunkSize) {
      const chunk = requests.slice(i, i + chunkSize);
      batches.push(this.dispatch(secretKey, chunk));
    }
    const responses = await Promise.all(batches);
    return responses.flat();
  }

  async decryptBatch(requests: MemoDecryptRequest[]): Promise<MemoDecryptResult[]> {
    if (!requests.length) return [];
    const groups = new Map<string, { secret: bigint; items: MemoDecryptRequest[] }>();
    requests.forEach((request) => {
      const key = request.secretKey.toString();
      if (!groups.has(key)) {
        groups.set(key, { secret: request.secretKey, items: [] });
      }
      groups.get(key)!.items.push(request);
    });
    const tasks = Array.from(groups.values()).map(({ secret, items }) => this.decryptWithKey(secret, items));
    const results = await Promise.all(tasks);
    return results.flat();
  }

  private decryptSingle(secretKey: bigint, request: MemoDecryptRequest): MemoDecryptResult {
    try {
      const record = MemoKit.decryptMemo(secretKey, request.memo);
      return { memo: request.memo, record, metadata: request.metadata };
    } catch (error) {
      return {
        memo: request.memo,
        record: null,
        metadata: request.metadata,
        error: { message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
