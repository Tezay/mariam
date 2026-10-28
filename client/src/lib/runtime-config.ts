// Absent while the server renders a page, which never calls the API through these.
const config = typeof window === 'undefined' ? undefined : window.__RUNTIME_CONFIG__;

export const API_URL = config?.API_URL || '/v1';

/** Deployment tag of the running frontend image; 'dev' outside a built container. */
export const APP_VERSION = config?.APP_VERSION || 'dev';

// Set with or without a DSN, so it names the deployment rather than the error tracker.
export const APP_ENVIRONMENT = config?.SENTRY_ENVIRONMENT || 'development';

export interface MapTiles {
  url: string;
  attribution: string;
}
