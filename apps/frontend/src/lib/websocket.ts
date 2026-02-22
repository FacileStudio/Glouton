import { browser } from '$app/environment';
import { writable } from 'svelte/store';

type MessageHandler = (data: any) => void;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = Infinity;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private token: string | null = null;
  public connectionState = writable<ConnectionState>('disconnected');

  private getWebSocketUrl(): string {
    if (!browser) {
      return '';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const host = new URL(apiUrl).host;
    const url = `${protocol}//${host}/ws`;

    return url;
  }

  connect(token: string) {
    if (!browser) return;

    const wsBaseUrl = this.getWebSocketUrl();

    if (!wsBaseUrl) {
      console.error('[WebSocket] Failed to get WebSocket URL');
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.token = token;
    const wsUrl = `${wsBaseUrl}?token=${token}`;

    this.connectionState.set(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.connectionState.set('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          const handlers = this.handlers.get(message.type);
          if (handlers) {
            handlers.forEach((handler) => {
              handler(message.data);
            });
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      this.ws.onclose = (event) => {
        this.connectionState.set('disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.connectionState.set('disconnected');
      };
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.connectionState.set('disconnected');
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.connectionState.set('failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    this.connectionState.set('reconnecting');

    this.reconnectTimeout = setTimeout(() => {
      if (this.token) {
        this.connect(this.token);
      }
    }, delay);
  }

  resetConnection() {
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.token) {
      this.connect(this.token);
    }
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => {
      const handlers = this.handlers.get(type);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(type);
        }
      }
    };
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.handlers.clear();
    this.reconnectAttempts = 0;
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}

export const ws = new WebSocketClient();
