export const API_URL = window.__RUNTIME_CONFIG__?.API_URL || '/v1';

/** Deployment tag of the running frontend image; 'dev' outside a built container. */
export const APP_VERSION = window.__RUNTIME_CONFIG__?.APP_VERSION || 'dev';

// Set with or without a DSN, so it names the deployment rather than the error tracker.
export const APP_ENVIRONMENT = window.__RUNTIME_CONFIG__?.SENTRY_ENVIRONMENT || 'development';
