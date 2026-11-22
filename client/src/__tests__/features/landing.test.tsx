import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { Account } from '@/lib/api/user';
import { stubLocalStorage } from '../session-fixtures';

const crous = { slug: 'crous', name: 'Crous' };
const account = {
  sites: [
    { slug: 'nord', name: 'Nord', role: 'admin', organization: crous },
    { slug: 'sud', name: 'Sud', role: 'editor', organization: crous },
  ],
  organizations: [],
} as unknown as Account;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: account }) }));

const { Landing } = await import('@/pages/PlacesPage');

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function landOn(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<Landing />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('the landing of an account with several places', () => {
  beforeEach(() => {
    stubLocalStorage();
    localStorage.setItem(
      'mariam-last-place',
      JSON.stringify({ kind: 'site', org: 'crous', site: 'sud' })
    );
  });

  it('opens the last place on a wide screen', () => {
    landOn(true);

    expect(screen.getByTestId('where').textContent).toBe('/admin/crous/sud');
  });

  it('asks on a phone, where the place does not show', () => {
    landOn(false);

    expect(screen.getByText('Où voulez-vous travailler ?')).toBeDefined();
  });
});
