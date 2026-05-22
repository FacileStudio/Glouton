import http from 'node:http';
import https from 'node:https';
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

const server = http.createServer((req, res) => {
  if (isBackendPath(req.url)) {
    proxyHttp(req, res);
    return;
  }

  handler(req, res);
});

server.listen(port, host, () => {
  console.log(`Glouton frontend listening on ${host}:${port}`);
});
