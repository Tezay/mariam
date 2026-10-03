import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import license from 'rollup-plugin-license'
import path from 'path'
import fs from 'fs'

// compose.yaml points it at the backend container.
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:5000'

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
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            // injectManifest, not generateSW: the service worker carries the push handlers.
            srcDir: 'src',
            filename: 'sw-push.js',
            strategies: 'injectManifest',
            injectManifest: {
                globPatterns: [
                    '**/*.{js,css,html,ico,png,svg,webmanifest}',
                    // Latin covers French, Œ and € included; other subsets load on demand.
                    'assets/inter-latin-wght-normal-*.woff2',
                ],
                // Never precached: config.js is written at container start, and the service
                // worker builds the manifest response itself (resolveDynamicManifest).
                globIgnores: ['config.js', '**/*.webmanifest'],
            },
            // What the service worker serves for /site.webmanifest, unless the user's role
            // selects the admin or the org manifest.
            manifest: {
                name: 'Mariam',
                short_name: 'Mariam',
                description: 'Gestion des menus, simplement.',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                theme_color: '#093EAA',
                background_color: '#ffffff',
                lang: 'fr-FR',
                categories: ['food', 'lifestyle'],
                icons: [
                    {
                        src: '/favicon-96x96.png',
                        sizes: '96x96',
                        type: 'image/png',
                    },
                    {
                        src: '/web-app-manifest-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                    {
                        src: '/web-app-manifest-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                    {
                        src: '/apple-touch-icon.png',
                        sizes: '180x180',
                        type: 'image/png',
                        purpose: 'any',
                    },
                ],
            },
            devOptions: {
                enabled: false,
            },
        }),
        {
            ...license({
                thirdParty: {
                    output: path.join(__dirname, 'dist', 'licenses', 'third-party.txt'),
                },
            }),
            apply: 'build',
        },
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
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
        },
        watch: {
            // Restarting on a change to this file crashes Vite inside Docker.
            ignored: ['**/vite.config.ts'],
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/__tests__/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
        },
    },
})
