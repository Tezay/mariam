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
