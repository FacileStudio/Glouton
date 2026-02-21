import type { EventEmitter } from '../workers/index';

export interface JobScope {
  type: 'personal' | 'team';
  userId: string;
  teamId?: string | null;
}

export class JobEventEmitter {
  constructor(
    private readonly emitter: EventEmitter,
    private readonly scope: JobScope
  ) {}

  async emit(type: string, data?: any): Promise<void> {
    if (this.scope.type === 'team' && this.scope.teamId) {
      await this.emitter.emitToScope(this.scope, type, data);
    } else {
      this.emitter.emit(this.scope.userId, type, data);
    }
  }
}
