import { isAxiosError } from 'axios';
import type { components } from './schema.gen';

// Routes not yet moved to problem details still answer { error, message? }.
type ErrorBody = Partial<components['schemas']['Problem']> & { error?: string; message?: string };

function errorBody(error: unknown): ErrorBody | undefined {
  return isAxiosError(error) ? (error.response?.data as ErrorBody | undefined) : undefined;
}

export function isConfirmationRequired(error: unknown): boolean {
  return errorBody(error)?.code === 'step_up_required';
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const body = errorBody(error);
  return body?.detail || body?.message || body?.error || fallback;
}

export type ApiErrorKind = 'network' | 'server' | 'forbidden' | 'notfound' | 'unknown';

export function getErrorType(error: unknown): ApiErrorKind {
  if (!error) return 'unknown';

  const axiosError = error as { response?: { status?: number }; code?: string };

  if (axiosError.code === 'ERR_NETWORK' || !axiosError.response) {
    return 'network';
  }

  const status = axiosError.response?.status;

  if (status === 403) return 'forbidden';
  if (status === 404) return 'notfound';
  if (status && status >= 500) return 'server';

  return 'unknown';
}
