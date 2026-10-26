import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { getApiErrorMessage, isConfirmationRequired } from '@/lib/api/errors';

function answered(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', AxiosError.ERR_BAD_REQUEST, config, null, {
    status,
    statusText: '',
    data,
    headers: {},
    config,
  });
}

describe('getApiErrorMessage', () => {
  it('shows the detail of a problem', () => {
    const error = answered(429, {
      title: 'Too Many Requests',
      status: 429,
      detail: 'Vous avez dépassé la limite autorisée. Réessayez plus tard.',
      code: 'rate_limited',
    });

    expect(getApiErrorMessage(error, 'Échec')).toBe(
      'Vous avez dépassé la limite autorisée. Réessayez plus tard.'
    );
  });

  it('names the first invalid field rather than the whole request', () => {
    const error = answered(422, {
      title: 'Unprocessable Entity',
      status: 422,
      detail: 'Certaines valeurs envoyées sont invalides.',
      code: 'validation_failed',
      errors: [
        { pointer: '/new_password', detail: 'Le mot de passe doit contenir 12 caractères.' },
      ],
    });

    expect(getApiErrorMessage(error, 'Échec')).toBe('Le mot de passe doit contenir 12 caractères.');
  });

  it('reads nothing but a problem', () => {
    const error = answered(400, { error: 'Mot de passe trop faible' });

    expect(getApiErrorMessage(error, 'Échec')).toBe('Échec');
  });

  it('falls back when nothing answered', () => {
    expect(getApiErrorMessage(new Error('Network Error'), 'Échec')).toBe('Échec');
  });
});

describe('isConfirmationRequired', () => {
  it('reads the code of the problem', () => {
    expect(isConfirmationRequired(answered(403, { code: 'step_up_required' }))).toBe(true);
    expect(isConfirmationRequired(answered(403, { code: 'admin_required' }))).toBe(false);
  });
});
