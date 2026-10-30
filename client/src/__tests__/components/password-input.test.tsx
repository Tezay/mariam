import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordInput } from '@/components/PasswordInput';

function renderField() {
  render(
    <form onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="password">Mot de passe</label>
      <PasswordInput id="password" />
      <button type="submit">Envoyer</button>
    </form>
  );
  return screen.getByLabelText('Mot de passe') as HTMLInputElement;
}

describe('PasswordInput', () => {
  it('shows the password, then masks it again', async () => {
    const field = renderField();

    await userEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    expect(field.type).toBe('text');

    await userEvent.click(screen.getByRole('button', { name: 'Masquer le mot de passe' }));
    expect(field.type).toBe('password');
  });

  it('is masked again when its form is sent', async () => {
    const field = renderField();

    await userEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(field.type).toBe('password');
  });

  it('keeps the shown text from the spell checker', () => {
    expect(renderField().getAttribute('spellcheck')).toBe('false');
  });
});
