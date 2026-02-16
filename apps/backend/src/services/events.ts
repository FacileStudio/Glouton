export interface EventMessage {
  type: string;
  data?: any;
  timestamp: Date;
}

interface WebSocketBroadcaster {
  broadcastToUser: (userId: string, message: any) => void;
  broadcastToAll: (message: any) => void;
}

class EventEmitter {
  private broadcaster: WebSocketBroadcaster | null = null;

  init(broadcaster: WebSocketBroadcaster) {
    this.broadcaster = broadcaster;
  }

  emit(userId: string, type: string, data?: any) {
    if (!this.broadcaster) return;

    this.broadcaster.broadcastToUser(userId, {
      type,
      data,
      timestamp: new Date(),
    });
  }

  broadcast(type: string, data?: any) {
    if (!this.broadcaster) return;

    this.broadcaster.broadcastToAll({
      type,
      data,
      timestamp: new Date(),
    });
  }
}

export const events = new EventEmitter();