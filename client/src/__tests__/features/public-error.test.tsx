import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PublicError } from '@/pages/public/PublicError';

const notFound = (data: unknown) => ({
  status: 404,
  statusText: 'Not Found',
  internal: false,
  data,
});

function show(data: unknown) {
  render(
    <MemoryRouter>
      <PublicError error={notFound(data)} org="crous" />
    </MemoryRouter>
  );
}

describe('the public error screen', () => {
  it.each([
    ['organization', 'Page introuvable.', '/'],
    ['site', 'Restaurant introuvable.', '/crous'],
  ])('a 404 carrying %j shows %j, with a way back', (data, text, back) => {
    show(data);

    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe(back);
  });

  it("takes a proxy's 404 for an outage", () => {
    show('404 page not found');

    expect(screen.getByText('Menu momentanément indisponible')).toBeTruthy();
  });
});
