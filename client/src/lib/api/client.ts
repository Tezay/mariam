import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '../runtime-config';
import { isConfirmationRequired } from './errors';
import { csrfToken, endSession, forgetConfirmation, hasSession } from './session';

export const PUBLIC_API_TIMEOUT_MS = 20000;

const WRITES = new Set(['post', 'put', 'patch', 'delete']);

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = WRITES.has(config.method ?? '') ? csrfToken('access') : null;
  if (token) config.headers['X-CSRF-TOKEN'] = token;
  return config;
});

let renewal: Promise<void> | null = null;

// One renewal answers every request refused meanwhile. Outside `api`: a 401 here
// would wait for itself.
function renewSession(): Promise<void> {
  renewal ??= axios
    .post(`${API_URL}/auth/refresh`, null, {
      withCredentials: true,
      headers: { 'X-CSRF-TOKEN': csrfToken('refresh') ?? '' },
    })
    .then(() => forgetConfirmation())
    .finally(() => {
      renewal = null;
    });
  return renewal;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // These run before a session exists, so no refresh can cure their 401.
    const isAuthEndpoint =
      request.url?.includes('/auth/login') ||
      request.url?.includes('/auth/activate') ||
      request.url?.includes('/auth/mfa/verify') ||
      request.url?.includes('/auth/passkey/login') ||
      request.url?.includes('/auth/passkey/setup') ||
      request.url?.includes('/auth/reset-password') ||
      request.url?.includes('/auth/passkey/reset-password') ||
      request.url?.includes('/auth/session-transfer/validate');

    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (isConfirmationRequired(error)) forgetConfirmation();

    if (error.response?.status !== 401 || request._retry) {
      return Promise.reject(error);
    }

    request._retry = true;
    const renewed =
      hasSession() &&
      (await renewSession().then(
        () => true,
        () => false
      ));
    if (!renewed) {
      endSession();
      return Promise.reject(error);
    }
    return api(request);
  }
);

// No session and no refresh: a public page must neither read as a member, drafts
// included, nor send a visitor to the login. Only `fetch` can leave out the cookies
// of a request to the same origin.
export const publicAxios = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  adapter: 'fetch',
  withCredentials: false,
});

export interface OrgRef {
  org: string;
}

export interface SiteRef extends OrgRef {
  site: string;
}

export function orgPath({ org }: OrgRef): string {
  return `/orgs/${encodeURIComponent(org)}`;
}

export function sitePath({ org, site }: SiteRef): string {
  return `${orgPath({ org })}/sites/${encodeURIComponent(site)}`;
}

export function scopePath(ref: OrgRef | SiteRef): string {
  return 'site' in ref ? sitePath(ref) : orgPath(ref);
}
