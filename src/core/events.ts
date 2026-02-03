import EventEmitter from 'eventemitter3';
import type { SdkEvent } from '../types';

export class SdkEventBus {
  private readonly emitter = new EventEmitter<SdkEvent['type']>();

  emit(event: SdkEvent) {
    this.emitter.emit(event.type, event);
  }

  on<T extends SdkEvent['type']>(type: T, handler: (event: Extract<SdkEvent, { type: T }>) => void) {
    this.emitter.on(type, handler as any);
  }

  off<T extends SdkEvent['type']>(type: T, handler: (event: Extract<SdkEvent, { type: T }>) => void) {
    this.emitter.off(type, handler as any);
  }

  removeAllListeners() {
    this.emitter.removeAllListeners();
  }
}
