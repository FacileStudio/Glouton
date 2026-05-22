import { browser } from '$app/environment';
import { writable } from 'svelte/store';

type MessageHandler = (data: any) => void;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

class WebSocketClient {
	private eventSource: EventSource | null = null;
	private handlers = new Map<string, Set<MessageHandler>>();
	private token: string | null = null;
	public connectionState = writable<ConnectionState>('disconnected');

	connect(token: string) {
		if (!browser) return;

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
			};
		} catch (error) {
			console.error('[Events] Connection error:', error);
			this.connectionState.set('disconnected');
		}
	}

	resetConnection() {
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
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}

		this.handlers.clear();
		this.connectionState.set('disconnected');
	}

	send(_message: any) {
		// SSE is server-to-client only
	}
}

export const ws = new WebSocketClient();
