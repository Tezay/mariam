import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { passkeyRegistrationError } from '@/lib/passkey-errors';

function browserRefusal(name: string): Error {
  const error = new Error('The operation either timed out or was not allowed.');
  error.name = name;
  return error;
}

describe('passkeyRegistrationError', () => {
  it.each([
    ['InvalidStateError', 'Cet appareil possède déjà une passkey pour ce compte.'],
    ['NotAllowedError', 'Enregistrement annulé. Réessayez.'],
    ['SecurityError', 'Les passkeys ne sont pas disponibles sur cette adresse.'],
  ])('names a %s', (name, message) => {
    expect(passkeyRegistrationError(browserRefusal(name))).toBe(message);
  });

  it('passes on what the server answered', () => {
    const config = { headers: new AxiosHeaders() };
    const refused = new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
      data: { error: 'Vérification échouée' },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config,
    });

    expect(passkeyRegistrationError(refused)).toBe('Vérification échouée');
  });

  it('falls back on a plain message', () => {
    expect(passkeyRegistrationError(new Error('boom'))).toBe(
      "Impossible d'enregistrer la passkey."
    );
  });
});
