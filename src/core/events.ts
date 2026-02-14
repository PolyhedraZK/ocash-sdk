import EventEmitter from 'eventemitter3';
import type { SdkEvent } from '../types';

/**
 * Thin wrapper around EventEmitter3 to strongly type SDK events.
 */
export class SdkEventBus {
  private readonly emitter = new EventEmitter<SdkEvent['type']>();

  /**
   * Emit a typed SDK event to all listeners.
   */
  emit(event: SdkEvent) {
    this.emitter.emit(event.type, event);
  }

  /**
   * Subscribe to a specific SDK event type.
   */
  on<T extends SdkEvent['type']>(type: T, handler: (event: Extract<SdkEvent, { type: T }>) => void) {
    this.emitter.on(type, handler);
  }

  /**
   * Unsubscribe a handler from a specific SDK event type.
   */
  off<T extends SdkEvent['type']>(type: T, handler: (event: Extract<SdkEvent, { type: T }>) => void) {
    this.emitter.off(type, handler);
  }

  /**
   * Remove all registered listeners. Used during core reset.
   */
  removeAllListeners() {
    this.emitter.removeAllListeners();
  }
}
