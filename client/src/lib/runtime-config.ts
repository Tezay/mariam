const getApiUrl = (): string => {
  const runtimeUrl = window.__RUNTIME_CONFIG__?.API_URL;
  // public/config.js ships this placeholder; only the container entrypoint replaces it.
  if (runtimeUrl && runtimeUrl !== '__API_URL__') {
    return runtimeUrl;
  }
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return 'http://localhost:5000/v1';
};

export const API_URL = getApiUrl();

/** Deployment tag of the running frontend image; 'dev' outside a built container. */
export const APP_VERSION = window.__RUNTIME_CONFIG__?.APP_VERSION || 'dev';

// The entrypoint always writes SENTRY_ENVIRONMENT, with or without a DSN, so it
// names the deployment rather than the error tracker.
export const APP_ENVIRONMENT = window.__RUNTIME_CONFIG__?.SENTRY_ENVIRONMENT || 'development';
