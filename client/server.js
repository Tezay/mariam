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

function cachePublicFile(res, filePath) {
  if (filePath.endsWith('.js')) {
    // The service worker and theme-init.js keep their name from one build to the next.
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
app.use(createRequestHandler({ build: await import('./build/server/index.js') }));

const server = app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

process.on('SIGTERM', () => server.close());
