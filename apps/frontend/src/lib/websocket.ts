import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import type { WsEventPayload } from './websocket-events';

type MessageHandler = (data: unknown) => void;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

class WebSocketClient {
	private eventSource: EventSource | null = null;
	private handlers = new Map<string, Set<MessageHandler>>();
	private token: string | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempts = 0;
	public connectionState = writable<ConnectionState>('disconnected');

	connect(token: string) {
		if (!browser) return;

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}

		this.token = token;
		const url = `/api/events?token=${encodeURIComponent(token)}`;

		this.connectionState.set('connecting');

		try {
			this.eventSource = new EventSource(url);

			this.eventSource.onopen = () => {
				this.reconnectAttempts = 0;
				this.connectionState.set('connected');
			};

			this.eventSource.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data);

					const handlers = this.handlers.get(message.type);
					if (handlers) {
						handlers.forEach((handler) => {
							handler(message.data);
						});
					}
				} catch (error) {
					console.error('[Events] Error parsing message:', error);
				}
			};

			this.eventSource.onerror = () => {
				this.connectionState.set('reconnecting');
				// EventSource ne réessaie jamais après une réponse non-200
				// (ex: 404 Traefik pendant un deploy) : readyState passe à
				// CLOSED et il faut reconnecter nous-mêmes, avec backoff.
				if (this.eventSource?.readyState === EventSource.CLOSED) {
					this.scheduleReconnect();
				}
			};
		} catch (error) {
			console.error('[Events] Connection error:', error);
			this.connectionState.set('disconnected');
		}
	}

	private scheduleReconnect() {
		if (this.reconnectTimer || !this.token) return;
		const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
		this.reconnectAttempts++;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (this.token) this.connect(this.token);
		}, delay);
	}

	resetConnection() {
		if (this.token) {
			this.connect(this.token);
		}
	}

	on<T = WsEventPayload>(type: string, onMessage: (data: T) => void) {
		const handler: MessageHandler = (data) => onMessage(data as T);
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
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.token = null;
		this.reconnectAttempts = 0;

		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}

		this.handlers.clear();
		this.connectionState.set('disconnected');
	}
}

export const ws = new WebSocketClient();
