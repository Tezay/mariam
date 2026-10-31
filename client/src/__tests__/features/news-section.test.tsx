import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { News } from '@/lib/api/news';
import { NewsSection } from '@/pages/public/menu/NewsSection';
import { newsLabel } from '@/pages/public/menu/news-label';

const TODAY = '2026-09-23';

function item(fields: Partial<News> = {}): News {
  return {
    id: 1,
    title: 'Soirée',
    date: TODAY,
    pinned: false,
    published_at: '2026-10-09T08:00:00Z',
    images: [],
    ...fields,
  };
}

async function openDetail(description: string) {
  render(<NewsSection news={[item({ description })]} today={TODAY} />);
  await userEvent.click(screen.getByText('Soirée'));
  return document.querySelector('.rich-text');
}

describe('news descriptions on the public page', () => {
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

describe('the line above a news title', () => {
  it('names the day, today, or the day it was published', () => {
    expect(newsLabel(item(), TODAY)).toBe("Aujourd'hui");
    expect(newsLabel(item({ date: '2026-10-15' }), TODAY)).toBe('Jeudi 15 octobre');
    expect(newsLabel(item({ date: null, pinned: true }), TODAY)).toBe(
      'À la une · Publiée le 9 octobre'
    );
  });

  it('shows an undated pinned item on the page', () => {
    render(<NewsSection news={[item({ date: null, pinned: true })]} today={TODAY} />);

    expect(screen.getByText('À la une · Publiée le 9 octobre')).toBeTruthy();
  });
});
