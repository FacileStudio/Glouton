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
  private prisma: any = null;

  init(broadcaster: WebSocketBroadcaster, prisma?: any) {
    this.broadcaster = broadcaster;
    this.prisma = prisma;
  }

  emit(userId: string, type: string, data?: any) {
    if (!this.broadcaster) return;

    this.broadcaster.broadcastToUser(userId, {
      type,
      data,
      timestamp: new Date(),
    });
  }

  async emitToTeam(teamId: string, type: string, data?: any) {
    if (!this.broadcaster || !this.prisma) {
      console.warn('[EVENTS] Team broadcast not available - broadcaster or prisma not initialized');
      return;
    }

    try {
      const teamMembers = await this.prisma.$queryRaw<Array<{ userId: string }>>`
        SELECT "userId"
        FROM "TeamMember"
        WHERE "teamId" = ${teamId}::text
      `;

      const message = {
        type,
        data,
        timestamp: new Date(),
      };

      for (const member of teamMembers) {
        this.broadcaster.broadcastToUser(member.userId, message);
      }
    } catch (error) {
      console.error('[EVENTS] Failed to broadcast to team:', error);
    }
  }

  async emitToScope(scope: { type: 'personal' | 'team'; userId: string; teamId?: string }, type: string, data?: any) {
    if (scope.type === 'team' && scope.teamId) {
      await this.emitToTeam(scope.teamId, type, data);
    } else {
      this.emit(scope.userId, type, data);
    }
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