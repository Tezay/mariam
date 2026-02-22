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

// Enregistrement du Service Worker (PWA + notifications push)
registerSW({
    onRegisterError(error) {
        console.error('[MARIAM] Échec enregistrement SW :', error)
    },
})

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
