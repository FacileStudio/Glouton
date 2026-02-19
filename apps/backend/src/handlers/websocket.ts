import { createBunWebSocket } from 'hono/bun';
import type { ServerWebSocket } from 'bun';
import { logger } from '@repo/logger';
import { AuthManager } from '@repo/auth';

interface WebSocketData {
  userId?: string;
  createdAt: number;
  connectionId?: string;
}

const clients = new Map<string, Set<ServerWebSocket<WebSocketData>>>();

export const { upgradeWebSocket, websocket } = createBunWebSocket<WebSocketData>();

/**
 * broadcastToUser
 */
export function broadcastToUser(userId: string, message: any) {
  const userClients = clients.get(userId);

  if (!userClients) {
    logger.debug(`[WebSocket] No clients connected for user ${userId.slice(0, 8)}`);
    return;
  }

  let messageStr: string;
  try {
    messageStr = JSON.stringify(message);
  } catch (error) {
    logger.error(`[WebSocket] Failed to stringify message for user ${userId.slice(0, 8)}:`, error);
    return;
  }
  let sentCount = 0;
  const staleConnections: ServerWebSocket<WebSocketData>[] = [];

  userClients.forEach((ws) => {
    try {
      if (ws.readyState === 1) {
        ws.send(messageStr);
        sentCount++;
      } else {
        staleConnections.push(ws);
      }
    } catch (error) {
      logger.error(`[WebSocket] Error sending to client:`, error);
      staleConnections.push(ws);
    }
  });

  staleConnections.forEach((ws) => {
    userClients.delete(ws);
  });

  if (userClients.size === 0) {
    clients.delete(userId);
  }

  if (message.type !== 'pong' && sentCount > 0) {
    logger.debug(`[WebSocket] Broadcasted ${message.type} to ${sentCount} client(s) for user ${userId.slice(0, 8)}`);
  }
}

export function broadcastToAll(message: any) {
  let messageStr: string;
  try {
    messageStr = JSON.stringify(message);
  } catch (error) {
    logger.error('[WebSocket] Failed to stringify broadcast message:', error);
    return;
  }
  let totalSent = 0;
  let totalStale = 0;

  clients.forEach((userClients, userId) => {
    const staleConnections: ServerWebSocket<WebSocketData>[] = [];

    userClients.forEach((ws) => {
      try {
        if (ws.readyState === 1) {
          ws.send(messageStr);
          totalSent++;
        } else {
          staleConnections.push(ws);
        }
      } catch (error) {
        staleConnections.push(ws);
      }
    });

    staleConnections.forEach((ws) => {
      userClients.delete(ws);
      totalStale++;
    });

    if (userClients.size === 0) {
      clients.delete(userId);
    }
  });
}

export const wsHandler = upgradeWebSocket(async (c) => {
  const token = c.req.query('token');
  let userId: string | undefined;

  if (token) {
    try {
      const authManager = new AuthManager({ encryptionSecret: process.env.ENCRYPTION_SECRET! });
      const user = await authManager.verifyToken(token);
      if (user) {
        userId = user.id;
      }
    } catch (error) {
      logger.debug('[WebSocket] Invalid token');
    }
  }

  return {
    onOpen(_event, ws) {
      const connectionId = Math.random().toString(36).substring(2, 15);
      ws.data = {
        userId,
        createdAt: Date.now(),
        connectionId,
      };

      if (userId) {
        if (!clients.has(userId)) {
          clients.set(userId, new Set());
        }
        const userClients = clients.get(userId)!;
        const prevCount = userClients.size;
        userClients.add(ws);
        logger.debug(`[WebSocket] User connected: ${userId} (connection: ${connectionId}, total connections: ${userClients.size})`);

        if (prevCount > 0) {
          logger.warn(`[WebSocket] User ${userId.slice(0, 8)} has multiple connections: ${userClients.size}`);
        }
      }

      const connectedMsg = {
        type: 'connected',
        connectionId,
        timestamp: new Date()
      };
      ws.send(JSON.stringify(connectedMsg));
    },

    onMessage(event, ws) {
      try {
        const data = JSON.parse(event.data.toString());

        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
        }
      } catch (error) {
        logger.debug('[WebSocket] Invalid message');
      }
    },

    onClose(_event, ws) {
      const userId = ws.data?.userId;
      const connectionId = ws.data?.connectionId;

      if (userId) {
        const userClients = clients.get(userId);

        if (userClients) {
          userClients.delete(ws);
          const remaining = userClients.size;

          if (remaining === 0) {
            clients.delete(userId);
          }
          logger.debug(`[WebSocket] User disconnected: ${userId.slice(0, 8)} (connection: ${connectionId}, remaining connections: ${remaining})`);
        }
      }
    },

    onError(event, ws) {
      logger.debug('[WebSocket] Connection error');

      const userId = ws.data?.userId;
      if (userId) {
        const userClients = clients.get(userId);
        if (userClients) {
          userClients.delete(ws);
          if (userClients.size === 0) {
            clients.delete(userId);
          }
          logger.debug(`[WebSocket] User disconnected due to error: ${userId}`);
        }
      }
    },
  };
});

export { clients };
