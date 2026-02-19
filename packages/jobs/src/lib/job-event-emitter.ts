import type { EventEmitter } from '../workers/index';

export class JobEventEmitter {
  constructor(
    private readonly emitter: EventEmitter,
    private readonly userId: string
  ) {}

  emit(type: string, data?: any): void {
    this.emitter.emit(this.userId, type, data);
  }
}
