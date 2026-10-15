import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';
import * as Sentry from '@sentry/react';
import { canonicalTarget, migrateToCanonicalHost } from './lib/canonical-host';

async function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const { Workbox } = await import('workbox-window');
    const worker = new Workbox('/sw-push.js', { scope: '/' });
    // The worker takes over as soon as it is installed: a page still running
    // the previous build reloads onto the new one.
    worker.addEventListener('activated', (event) => {
      if (event.isUpdate || event.isExternal) window.location.reload();
    });
    await worker.register();
  } catch (error) {
    console.error('[MARIAM] Service worker registration failed:', error);
  }
}

function bootstrap() {
  const sentryDsn = window.__RUNTIME_CONFIG__?.SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: window.__RUNTIME_CONFIG__?.SENTRY_ENVIRONMENT ?? 'production',
      tracesSampleRate: 0,
    });
  }

  const { UMAMI_SCRIPT_URL, UMAMI_WEBSITE_ID } = window.__RUNTIME_CONFIG__ ?? {};
  if (UMAMI_SCRIPT_URL && UMAMI_WEBSITE_ID) {
    const script = document.createElement('script');
    script.defer = true;
    script.src = UMAMI_SCRIPT_URL;
    script.dataset.websiteId = UMAMI_WEBSITE_ID;
    document.head.appendChild(script);
  }

  void registerServiceWorker();

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>
    );
  });
}

// A retired host must not register a service worker it is about to leave.
if (canonicalTarget(window.location.host, window.__RUNTIME_CONFIG__?.CANONICAL_HOST)) {
  void migrateToCanonicalHost();
} else {
  bootstrap();
}
