import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const site = { org: 'demo', site: 'sciences' };
const api = vi.hoisted(() => ({
  listDeclarations: vi.fn(),
  putDeclaration: vi.fn(),
  deleteDeclaration: vi.fn(),
}));

vi.mock('@/contexts/SiteContext', () => ({ useSiteRef: () => site }));
vi.mock('@/lib/api/quality', () => ({ qualityApi: api }));
vi.mock('@/lib/date-utils', () => ({ parisToday: () => '2026-10-31' }));

const { DeclarationsField } = await import('@/pages/admin/public-page/DeclarationsField');

const DECLARED = { year: 2024, sustainable_share: 30, organic_share: 12, territorial_share: null };

describe('DeclarationsField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listDeclarations.mockResolvedValue([DECLARED]);
  });

  it('declares last year from the figures typed', async () => {
    api.putDeclaration.mockResolvedValue({
      year: 2025,
      sustainable_share: 38.3,
      organic_share: 17.2,
      territorial_share: null,
    });
    render(<DeclarationsField />);
    await screen.findByText('2024');

    await userEvent.click(screen.getByRole('button', { name: 'Déclarer une année' }));
    await userEvent.type(screen.getByLabelText('Produits durables et de qualité'), '38,3');
    await userEvent.type(screen.getByLabelText('Dont produits bio'), '17,2');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(api.putDeclaration).toHaveBeenCalledWith(site, 2025, {
      sustainable_share: 38.3,
      organic_share: 17.2,
      territorial_share: null,
    });
    await screen.findByText('2025');
  });

  it('removes a year only once confirmed', async () => {
    api.deleteDeclaration.mockResolvedValue(undefined);
    render(<DeclarationsField />);

    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer 2024' }));
    expect(api.deleteDeclaration).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(api.deleteDeclaration).toHaveBeenCalledWith(site, 2024);
    await waitFor(() => expect(screen.queryByText('2024')).toBeNull());
  });
});
