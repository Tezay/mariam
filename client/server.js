import { BlockList } from 'node:net';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import morgan from 'morgan';
import { createRequestHandler } from '@react-router/express';

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const CLIENT = path.join(import.meta.dirname, 'build', 'client');

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const LONG_LIVED = /\.(?:css|jpe?g|gif|png|ico|svg|woff2?|ttf|eot)$/;

// The networks deploy/nginx and the API trust by default.
const INTERNAL = new BlockList();
INTERNAL.addSubnet('10.0.0.0', 8);
INTERNAL.addSubnet('172.16.0.0', 12);
INTERNAL.addSubnet('192.168.0.0', 16);
INTERNAL.addSubnet('127.0.0.0', 8);
INTERNAL.addSubnet('fc00::', 7, 'ipv6');
INTERNAL.addAddress('::1', 'ipv6');

function fromInternalPeer(address = '') {
  // Node reports an IPv4 peer of a dual-stack socket as ::ffff:a.b.c.d.
  const peer = address.startsWith('::ffff:') ? address.slice(7) : address;
  return peer.includes(':') ? INTERNAL.check(peer, 'ipv6') : INTERNAL.check(peer);
}

function cachePublicFile(res, filePath) {
  if (filePath.endsWith('.js')) {
    // The service worker and the head scripts keep their name from one build to the next.
    res.setHeader('Cache-Control', 'no-cache');
  } else if (LONG_LIVED.test(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set(SECURITY_HEADERS);
  next();
});
app.get('/healthz', (_req, res) => {
  res.type('text/plain').send('ok');
});
app.use(compression());
app.use('/assets', express.static(path.join(CLIENT, 'assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(CLIENT, { setHeaders: cachePublicFile }));
app.use(morgan('tiny'));
// The API believes X-Real-IP from this server, which passes it on: only the proxy may set it.
app.use((req, _res, next) => {
  if (!fromInternalPeer(req.socket.remoteAddress)) delete req.headers['x-real-ip'];
  next();
});
app.use(createRequestHandler({ build: await import('./build/server/index.js') }));

const server = app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

process.on('SIGTERM', () => server.close());
