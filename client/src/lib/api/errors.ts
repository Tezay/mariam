import { isAxiosError } from 'axios';
import type { components } from './schema.gen';

export type Problem = components['schemas']['Problem'];

function problem(error: unknown): Partial<Problem> | undefined {
  return isAxiosError(error) ? (error.response?.data as Partial<Problem> | undefined) : undefined;
}

/** The stable `code` of the problem the API answered, for a program to branch on. */
export function getProblemCode(error: unknown): string | undefined {
  return problem(error)?.code;
}

export function isConfirmationRequired(error: unknown): boolean {
  return getProblemCode(error) === 'step_up_required';
}

/** What to show the person: the first invalid field's message, or the problem's. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const body = problem(error);
  return body?.errors?.[0]?.detail || body?.detail || fallback;
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
