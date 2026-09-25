import { isAxiosError } from 'axios';

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { error?: string } | undefined)?.error;
    if (message) return message;
  }
  return fallback;
}
