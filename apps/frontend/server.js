import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { handler } from './build/handler.js';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const backendUrl = new URL(process.env.BACKEND_URL || 'http://localhost:3001');

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const isBackendPath = (url = '') => url === '/trpc' || url.startsWith('/trpc/') || url.startsWith('/trpc?');
const isWebSocketPath = (url = '') => url === '/ws' || url.startsWith('/ws?');

function backendPort() {
  if (backendUrl.port) return Number(backendUrl.port);
  return backendUrl.protocol === 'https:' ? 443 : 80;
}

function filteredHeaders(headers) {
  const next = {};

  for (const [name, value] of Object.entries(headers)) {
    if (hopByHopHeaders.has(name.toLowerCase())) continue;
    if (value === undefined) continue;
    next[name] = value;
  }

  next.host = backendUrl.host;
  return next;
}

function proxyHttp(req, res) {
  const client = backendUrl.protocol === 'https:' ? https : http;
  const proxyReq = client.request(
    {
      protocol: backendUrl.protocol,
      hostname: backendUrl.hostname,
      port: backendPort(),
      method: req.method,
      path: req.url,
      headers: filteredHeaders(req.headers),
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'Backend unavailable' }));
  });

  req.pipe(proxyReq);
}

function proxyWebSocket(req, socket, head) {
  if (backendUrl.protocol !== 'http:') {
    socket.destroy();
    return;
  }

  const backendSocket = net.connect(backendPort(), backendUrl.hostname, () => {
    backendSocket.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);

    const headers = { ...req.headers, host: backendUrl.host };
    for (const [name, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const item of value) backendSocket.write(`${name}: ${item}\r\n`);
      } else if (value !== undefined) {
        backendSocket.write(`${name}: ${value}\r\n`);
      }
    }

    backendSocket.write('\r\n');
    if (head.length > 0) backendSocket.write(head);

    socket.pipe(backendSocket);
    backendSocket.pipe(socket);
  });

  backendSocket.on('error', () => socket.destroy());
  socket.on('error', () => backendSocket.destroy());
}

const server = http.createServer((req, res) => {
  if (isBackendPath(req.url)) {
    proxyHttp(req, res);
    return;
  }

  handler(req, res);
});

server.on('upgrade', (req, socket, head) => {
  if (!isWebSocketPath(req.url)) {
    socket.destroy();
    return;
  }

  proxyWebSocket(req, socket, head);
});

server.listen(port, host, () => {
  console.log(`Glouton frontend listening on ${host}:${port}`);
});
