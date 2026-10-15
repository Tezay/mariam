import { isAxiosError } from 'axios';

export function isConfirmationRequired(error: unknown): boolean {
  return (
    isAxiosError(error) &&
    (error.response?.data as { step_up_required?: boolean } | undefined)?.step_up_required === true
  );
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { error?: string } | undefined)?.error;
    if (message) return message;
  }
  return fallback;
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
