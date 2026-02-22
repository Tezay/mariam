import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

// Proxy target for API requests in dev mode:
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:5000'

// ========================================
// HTTPS conditionnel pour le développement
// ========================================
// Si des certificats mkcert sont présents dans certs/, Vite démarre en HTTPS
// Sinon, il démarre en HTTP sans chiffrement
//
// Génération : ./scripts/generate-dev-certs.sh
// ========================================
function getDevHttpsConfig() {
    const certPaths = [
        // Dans Docker container (volume monté)
        { key: '/certs/dev-key.pem', cert: '/certs/dev.pem' },
        // En local (pour le développement hors Docker)
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
            // Le SW s'active immédiatement
            registerType: 'autoUpdate',
            // Inclure le handler push personnalisé dans le SW
            srcDir: 'src',
            filename: 'sw-push.js',
            strategies: 'injectManifest',
            injectManifest: {
                // Fichiers à mettre en cache (minimal, pas de mode offline complet)
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
            },
            // Le manifest est géré ici (remplace site.webmanifest statique)
            manifest: {
                name: 'Mariam',
                short_name: 'Mariam',
                description: 'Gestion des menus, simplement.',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                theme_color: '#001BB7',
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
            // Désactiver le mode développement intégré de VitePWA en dev
            devOptions: {
                enabled: false,
            },
        }),
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
            '/api': {
                target: apiProxyTarget,
                changeOrigin: true,
            },
        },
        watch: {
            // Ignore config file changes in Docker to prevent Vite restart crashes
            ignored: ['**/vite.config.ts'],
        },
    },
})
