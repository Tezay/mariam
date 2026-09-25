import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '../runtime-config';
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken } from './tokens';

export const PUBLIC_API_TIMEOUT_MS = 20000;

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // These run before a session exists, so no refresh can cure their 401.
    const isAuthEndpoint =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/activate') ||
      originalRequest.url?.includes('/auth/mfa/verify') ||
      originalRequest.url?.includes('/auth/passkey/login') ||
      originalRequest.url?.includes('/auth/passkey/setup') ||
      originalRequest.url?.includes('/auth/passkey/reset-password') ||
      originalRequest.url?.includes('/auth/session-transfer/validate');

    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    const status = error.response?.status;

    if (status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        // Not through `api`: its request interceptor would overwrite this header,
        // and a 401 here would wait in the refresh queue for itself.
        const response = await axios.post(`${API_URL}/auth/refresh`, null, {
          headers: {
            Authorization: `Bearer ${refreshToken}`,
          },
        });

        const newAccessToken = response.data.access_token;
        setAccessToken(newAccessToken);
        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// No token and no refresh: a public page must neither carry a staff session nor
// send a visitor to the login.
export const publicAxios = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Carries the token but not the refresh interceptor: a failed push call must not end the session.
export const pushAxios = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});
pushAxios.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
