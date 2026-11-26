// Absent while the server renders a page, which never calls the API through these.
const config = typeof window === 'undefined' ? undefined : window.__RUNTIME_CONFIG__;

export const API_URL = config?.API_URL || '/v1';

// Empty when one host serves the dashboard and the public pages.
export const PUBLIC_URL = config?.PUBLIC_URL || '';

/** Deployment tag of the running frontend image; 'dev' outside a built container. */
export const APP_VERSION = config?.APP_VERSION || 'dev';

// Set with or without a DSN, so it names the deployment rather than the error tracker.
export const APP_ENVIRONMENT = config?.SENTRY_ENVIRONMENT || 'development';

/** The operator's address; empty, the pages name no contact. */
export const SUPPORT_EMAIL = config?.SUPPORT_EMAIL || '';

/** Who runs this instance; empty, the pages say « l'éditeur du service ». */
export const OPERATOR_NAME = config?.OPERATOR_NAME || '';

export const STATUS_PAGE_URL = config?.STATUS_PAGE_URL || '';

export const DOCUMENT_URLS = {
  legalNotice: config?.LEGAL_NOTICE_URL || '',
  terms: config?.TERMS_URL || '',
  dpa: config?.DPA_URL || '',
  apiTerms: config?.API_TERMS_URL || '',
  sourceLicense: config?.SOURCE_LICENSE_URL || '',
};

export interface MapTiles {
  url: string;
  attribution: string;
}
