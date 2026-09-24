import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileEventSection } from '@/pages/public/mobile/MobileEventSection';
import type { EventData } from '@/pages/public/menu-types';

function event(description: string): EventData {
  return { id: 1, title: 'Soirée', description, event_date: '2026-09-23' };
}

async function openDetail(description: string) {
  const { container } = render(<MobileEventSection upcomingEvents={[event(description)]} />);
  await userEvent.click(screen.getByText('Soirée'));
  return container.querySelector('.rich-text');
}

describe('event descriptions on the public page', () => {
  it('renders what the editor wrote as markup, not as text', async () => {
    const block = await openDetail('<p><strong>Bon appétit</strong></p>');

    expect(block?.querySelector('strong')?.textContent).toBe('Bon appétit');
    expect(block?.textContent).not.toContain('<strong>');
  });

  it('still renders a description written before the editor existed', async () => {
    const block = await openDetail('- Entrée\n- Plat');

    expect(block?.querySelectorAll('li')).toHaveLength(2);
  });

  it('keeps a plain description plain', async () => {
    const block = await openDetail('Rendez-vous à 12h30.\nSalle A.');

    expect(block?.textContent).toContain('Rendez-vous à 12h30.');
    expect(block?.querySelector('br')).not.toBeNull();
  });
});
