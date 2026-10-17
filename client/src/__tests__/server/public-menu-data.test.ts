import { describe, it, expect } from 'vitest';
import { publicMenuData } from '@/pages/public/public-menu-data';
import type { PublicClosure, PublicEvent, PublicMenu, PublicSite } from '@/lib/api/sites';

// Thursday 15 October 2026, 23:30 in Paris: still Thursday there, already
// Friday in UTC.
const NOW = new Date('2026-10-15T21:30:00Z');

const site = {
  slug: 'alpha',
  name: 'Alpha',
  service_days: [0, 1, 2, 3, 4],
  service_hours: {},
  vote_enabled: true,
  vote_icon_preset: 'thumbs',
  dietary_tags: [],
  certifications: [],
  menu_window: { from: '2026-09-15', to: '2026-10-22' },
} satisfies PublicSite;

function menu(date: string): PublicMenu {
  return { date, categories: [], images: [], substitutions: {} };
}

function event(id: number, date: string): PublicEvent {
  return { id, title: `Événement ${id}`, date, images: [] };
}

function closure(id: number, start_date: string, end_date: string): PublicClosure {
  return { id, start_date, end_date };
}

describe('publicMenuData', () => {
  it('takes today and tomorrow from the Paris date of the instant', () => {
    const data = publicMenuData(
      { site, menus: [menu('2026-10-16')], events: [], closures: [] },
      NOW
    );

    expect(data.today).toMatchObject({ date: '2026-10-15', day_name: 'Jeudi', menu: null });
    expect(data.tomorrow).toMatchObject({ date: '2026-10-16', day_name: 'Vendredi' });
    expect(data.tomorrow?.menu?.date).toBe('2026-10-16');
  });

  it('sets apart the event of the day and the closure under way', () => {
    const data = publicMenuData(
      {
        site,
        menus: [],
        events: [event(1, '2026-10-15'), event(2, '2026-10-20')],
        closures: [closure(3, '2026-10-14', '2026-10-15'), closure(4, '2026-10-19', '2026-10-19')],
      },
      NOW
    );

    expect(data.todayEvent?.id).toBe(1);
    expect(data.upcomingEvents.map((e) => e.event_date)).toEqual(['2026-10-20']);
    expect(data.activeClosure?.id).toBe(3);
    expect(data.upcomingClosures.map((c) => c.id)).toEqual([4]);
  });
});
