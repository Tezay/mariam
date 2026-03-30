/**
 * MARIAM - Point d'entrée React
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { ThemeProvider } from './contexts/ThemeProvider.tsx'

// Umami analytics (injecté dynamiquement depuis la config runtime)
const umamiId = window.__RUNTIME_CONFIG__?.UMAMI_WEBSITE_ID
if (umamiId && umamiId !== '__UMAMI_WEBSITE_ID__') {
    const script = document.createElement('script')
    script.defer = true
    script.src = 'https://analytics.mariam.app/script.js'
    script.dataset.websiteId = umamiId
    document.head.appendChild(script)
}

// Rechargement automatique lors d'une mise à jour du SW
registerSW({
    onNeedRefresh() {
        window.location.reload()
    },
    onRegisterError(error) {
        console.error('[MARIAM] Échec enregistrement SW :', error)
    },
})
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SW_UPDATED') window.location.reload()
    })
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <ThemeProvider>
                    <App />
                </ThemeProvider>
            </AuthProvider>
        </BrowserRouter>
    </StrictMode>,
)
