import type { OCashSdkConfig, SdkEvent, ProofBridge } from '../types';
import { SdkEventBus } from './events';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { stableStringify } from '../utils/json';

const computeAssetsVersion = (assetsOverride: OCashSdkConfig['assetsOverride']): string => {
  if (!assetsOverride) return 'none';
  const json = stableStringify(assetsOverride);
  const digest = sha256(utf8ToBytes(json));
  return `sha256:${bytesToHex(digest)}`;
};

export class SdkCore {
  private initialized = false;
  private readonly eventBus = new SdkEventBus();

  constructor(
    private readonly config: OCashSdkConfig,
    private readonly proofBridge: ProofBridge,
  ) {
    // `config.onEvent` is invoked for every emitted event in `emit()`.
  }

  async ready(onProgress?: (value: number) => void) {
    if (this.initialized) {
      onProgress?.(1);
      return;
    }
    const startedAt = Date.now();
    const progress = (value: number) => {
      if (onProgress) onProgress(value);
      this.emit({
        type: 'core:progress',
        payload: { stage: 'fetch', loaded: Math.floor(value * 100), total: 100 },
      });
    };
    progress(0.4);
    await this.proofBridge.init();
    progress(1);
    this.initialized = true;
    this.emit({
      type: 'core:ready',
      payload: { durationMs: Date.now() - startedAt, assetsVersion: computeAssetsVersion(this.config.assetsOverride) },
    });
  }

  reset() {
    this.initialized = false;
    this.eventBus.removeAllListeners();
  }

  on<T extends SdkEvent['type']>(type: T, handler: (event: Extract<SdkEvent, { type: T }>) => void) {
    this.eventBus.on(type, handler);
  }

  off<T extends SdkEvent['type']>(type: T, handler: (event: Extract<SdkEvent, { type: T }>) => void) {
    this.eventBus.off(type, handler);
  }

  emit(event: SdkEvent) {
    this.eventBus.emit(event);
    this.config.onEvent?.(event);
  }
}
