export type BroadcastMessage = {
  type: string;
  data?: any;
  timestamp?: Date;
};

export type BroadcastToUserFn = (userId: string, message: BroadcastMessage) => void;
export type BroadcastToAllFn = (message: BroadcastMessage) => void;

export class BroadcastService {
  private broadcastToUserFn: BroadcastToUserFn | null = null;
  private broadcastToAllFn: BroadcastToAllFn | null = null;

  initialize(broadcastToUser: BroadcastToUserFn, broadcastToAll: BroadcastToAllFn): void {
    this.broadcastToUserFn = broadcastToUser;
    this.broadcastToAllFn = broadcastToAll;

    globalThis.broadcastToUser = broadcastToUser;
    globalThis.broadcastNewOpportunities = (opportunities: any[]) => {
      this.broadcastNewOpportunities(opportunities);
    };

    console.log('[BROADCAST] Broadcast service initialized');
  }

  broadcastToUser(userId: string, message: BroadcastMessage): void {
    if (!this.broadcastToUserFn) {
      console.warn('[BROADCAST] broadcastToUser not initialized');
      return;
    }
    this.broadcastToUserFn(userId, message);
  }

  broadcastToAll(message: BroadcastMessage): void {
    if (!this.broadcastToAllFn) {
      console.warn('[BROADCAST] broadcastToAll not initialized');
      return;
    }
    this.broadcastToAllFn(message);
  }

  broadcastNewOpportunities(opportunities: any[]): void {
    this.broadcastToAll({
      type: 'new-opportunities',
      data: opportunities,
      timestamp: new Date(),
    });
  }

  broadcastHuntProgress(userId: string, data: any): void {
    this.broadcastToUser(userId, {
      type: 'hunt-progress',
      data,
      timestamp: new Date(),
    });
  }

  broadcastAuditProgress(userId: string, data: any): void {
    this.broadcastToUser(userId, {
      type: 'audit-progress',
      data,
      timestamp: new Date(),
    });
  }

  broadcastStatsChanged(userId: string): void {
    this.broadcastToUser(userId, {
      type: 'stats-changed',
      timestamp: new Date(),
    });
  }
}

export const broadcastService = new BroadcastService();
