import { defineConfig } from 'vite';
import { reactRouter } from '@react-router/dev/vite';
import license from 'rollup-plugin-license';
import path from 'path';
import fs from 'fs';

// compose.yaml points them at the backend and storage containers.
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:5000';
const storageProxyTarget = process.env.STORAGE_PROXY_TARGET || 'http://localhost:9000';

// HTTPS from the mkcert certificates of scripts/generate-dev-certs.sh, when they exist.
function getDevHttpsConfig() {
  // /certs is the compose.yaml mount; ../certs the repository's folder, for Vite on the host.
  const certPaths = [
    { key: '/certs/dev-key.pem', cert: '/certs/dev.pem' },
    { key: '../certs/dev-key.pem', cert: '../certs/dev.pem' },
  ];
  for (const p of certPaths) {
    if (fs.existsSync(p.key) && fs.existsSync(p.cert)) {
      return { key: fs.readFileSync(p.key), cert: fs.readFileSync(p.cert) };
    }
  }
  return undefined;
}

export default defineConfig({
  plugins: [
    reactRouter(),
    {
      ...license({
        thirdParty: {
          output: path.join(import.meta.dirname, 'build', 'client', 'licenses', 'third-party.txt'),
        },
      }),
      apply: 'build',
      // The server build would overwrite the file with its own, shorter list.
      applyToEnvironment: (environment) => environment.name === 'client',
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    https: getDevHttpsConfig(),
    host: true,
    port: 5173,
    proxy: {
      '/v1': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      // Unversioned, like Nginx serves it in production.
      '/health': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      // The development bucket (S3_PUBLIC_URL of compose.yaml), over the page's own HTTPS:
      // browsers upgrade or block an http:// image on an https:// page.
      '/mariam-uploads': {
        target: storageProxyTarget,
        changeOrigin: true,
      },
    },
    watch: {
      // Restarting on a change to this file crashes Vite inside Docker.
      ignored: ['**/vite.config.ts'],
    },
  },
});
