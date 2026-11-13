import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/pages/public/tenant-layout';

type Props = Parameters<typeof ErrorBoundary>[0];

function notFound(data: unknown) {
  return {
    error: { status: 404, statusText: 'Not Found', internal: false, data },
  } as unknown as Props;
}

describe('the public error screen', () => {
  it.each([
    ['organization', 'Organisation introuvable.'],
    ['site', 'Restaurant introuvable.'],
    ['404 page not found', 'Menu momentanément indisponible'],
  ])('a 404 carrying %j shows %j', (data, text) => {
    render(<ErrorBoundary {...notFound(data)} />);

    expect(screen.getByText(text)).toBeTruthy();
  });
});
