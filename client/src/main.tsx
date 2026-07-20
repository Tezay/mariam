/**
 * MARIAM - Point d'entrée React
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { ThemeProvider } from './contexts/ThemeProvider.tsx';
import { ErrorBoundary, AppErrorFallback } from './components/ErrorBoundary.tsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Error tracking — no-op when no DSN is injected at runtime.
const sentryDsn = window.__RUNTIME_CONFIG__?.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: window.__RUNTIME_CONFIG__?.SENTRY_ENVIRONMENT ?? 'production',
    tracesSampleRate: 0,
  });
}

// Umami analytics (injecté dynamiquement depuis la config runtime)
const umamiId = window.__RUNTIME_CONFIG__?.UMAMI_WEBSITE_ID;
if (umamiId && umamiId !== '__UMAMI_WEBSITE_ID__') {
  const script = document.createElement('script');
  script.defer = true;
  script.src = 'https://analytics.mariam.app/script.js';
  script.dataset.websiteId = umamiId;
  document.head.appendChild(script);
}

// SW update
const updateSW = registerSW({
  onNeedRefresh() {
    toast('Nouvelle version disponible', {
      description: 'Rechargez pour mettre à jour Mariam.',
      duration: Infinity,
      action: { label: 'Recharger', onClick: () => updateSW(true) },
    });
  },
  onRegisterError(error) {
    console.error('[MARIAM] Échec enregistrement SW :', error);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={<AppErrorFallback />}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ThemeProvider>
              <App />
            </ThemeProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
