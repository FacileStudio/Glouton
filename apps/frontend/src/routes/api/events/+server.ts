import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url, request }) => {
	const token = url.searchParams.get('token');
	if (!token) {
		return new Response('Unauthorized', { status: 401 });
	}

	const backendUrl = env.BACKEND_URL || 'http://localhost:3001';
	const backendHost = new URL(backendUrl).host;
	const wsUrl = `ws://${backendHost}/ws?token=${encodeURIComponent(token)}`;

	let backendWs: WebSocket | null = null;
	let pingInterval: ReturnType<typeof setInterval> | null = null;
	let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

	const encoder = new TextEncoder();

	const cleanup = () => {
		if (pingInterval) clearInterval(pingInterval);
		if (keepaliveInterval) clearInterval(keepaliveInterval);
		if (backendWs && backendWs.readyState <= WebSocket.OPEN) {
			backendWs.close();
		}
		backendWs = null;
	};

	const stream = new ReadableStream({
		start(controller) {
			backendWs = new WebSocket(wsUrl);

			request.signal.addEventListener('abort', () => {
				cleanup();
				try {
					controller.close();
				} catch {}
			});

			backendWs.onopen = () => {
				try {
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`
						)
					);
				} catch {
					cleanup();
				}

				pingInterval = setInterval(() => {
					if (backendWs?.readyState === WebSocket.OPEN) {
						backendWs.send(JSON.stringify({ type: 'ping' }));
					}
				}, 25000);

				keepaliveInterval = setInterval(() => {
					try {
						controller.enqueue(encoder.encode(`: keepalive\n\n`));
					} catch {
						cleanup();
					}
				}, 15000);
			};

			backendWs.onmessage = (event) => {
				try {
					const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));
				} catch {
					cleanup();
				}
			};

			backendWs.onclose = () => {
				cleanup();
				try {
					controller.close();
				} catch {}
			};

			backendWs.onerror = () => {
				cleanup();
				try {
					controller.close();
				} catch {}
			};
		},
		cancel() {
			cleanup();
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
};
