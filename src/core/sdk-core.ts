import type { OCashSdkConfig, SdkEvent, ProofBridge } from '../types';
import { SdkEventBus } from './events';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { stableStringify } from '../utils/json';

/**
 * Compute a stable version string for the active assets override.
 * Used to report which WASM/circuit bundle the core was initialized with.
 */
const computeAssetsVersion = (assetsOverride: OCashSdkConfig['assetsOverride']): string => {
  if (!assetsOverride) return 'none';
  const json = stableStringify(assetsOverride);
  const digest = sha256(utf8ToBytes(json));
  return `sha256:${bytesToHex(digest)}`;
};

/**
 * Core orchestrator for SDK lifecycle.
 * Handles WASM init, emits lifecycle events, and acts as the central event hub.
 */
export class SdkCore {
  private initialized = false;
  private readonly eventBus = new SdkEventBus();

  constructor(
    private readonly config: OCashSdkConfig,
    private readonly proofBridge: ProofBridge,
  ) {
    // `config.onEvent` is invoked for every emitted event in `emit()`.
  }

  /**
   * Initialize the proof bridge once and emit progress/ready events.
   * Subsequent calls are no-ops but still report 100% progress.
   */
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

  /**
   * Reset initialization state and clear all event listeners.
   * Does not unload WASM; it only resets SDK-side state.
   */
  reset() {
    this.initialized = false;
    this.eventBus.removeAllListeners();
  }

  /**
   * Register a handler for a specific SDK event type.
   */
  on<T extends SdkEvent['type']>(type: T, handler: (event: Extract<SdkEvent, { type: T }>) => void) {
    this.eventBus.on(type, handler);
  }

  /**
   * Unregister a previously registered event handler.
   */
  off<T extends SdkEvent['type']>(type: T, handler: (event: Extract<SdkEvent, { type: T }>) => void) {
    this.eventBus.off(type, handler);
  }

  /**
   * Emit an SDK event to local listeners and the global onEvent callback.
   */
  emit(event: SdkEvent) {
    this.eventBus.emit(event);
    this.config.onEvent?.(event);
  }
}
