import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Proxy target for API requests in dev mode:
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:5000'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        host: true,
        port: 5173,
        proxy: {
            '/api': {
                target: apiProxyTarget,
                changeOrigin: true,
            },
        },
    },
})
