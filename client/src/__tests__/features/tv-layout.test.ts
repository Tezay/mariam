import { describe, expect, it } from 'vitest';
import { screenQrLine } from '@/features/analytics/format';
import type { MenuResponse } from '@/pages/public/menu-types';
import { visitKind } from '@/pages/public/site/visit-kind';
import {
  menuDensity,
  nextReloadDelay,
  reopeningDay,
  rotationOf,
  screenQrUrl,
  tvCategories,
} from '@/pages/public/tv/tv-layout';

function dish(id: number) {
  return { id, name: `Plat ${id}`, tags: [], certifications: [] };
}

function category(id: number, items: { id: number; out?: boolean }[]) {
  return {
    id,
    label: `Catégorie ${id}`,
    is_highlighted: false,
    order: id,
    items: items.map((item) => ({ id: item.id, dish: dish(item.id), is_out_of_stock: item.out })),
  };
}

describe('the categories on the screen', () => {
  it('opens subcategories, drops empty ones, and adds substitutes only once a dish runs out', () => {
    const menu: MenuResponse = {
      date: '2026-11-03',
      by_category: [
        {
          ...category(1, []),
          is_highlighted: true,
          subcategories: [category(2, [{ id: 20 }]), category(3, [])],
        },
        category(4, [{ id: 40, out: true }]),
        category(5, [{ id: 50 }]),
      ],
      substitutions: { 4: [{ dish: dish(41), order: 0 }], 5: [{ dish: dish(51), order: 0 }] },
    };

    const shown = tvCategories(menu);

    expect(shown.map((entry) => entry.id)).toEqual([2, 4, 5]);
    expect(shown[0].label).toBe('Catégorie 1 · Catégorie 2');
    expect(shown.map((entry) => entry.highlighted)).toEqual([true, false, false]);
    expect(shown[1].dishes.map((entry) => [entry.dish.id, entry.substitute])).toEqual([
      [40, false],
      [41, true],
    ]);
    expect(shown[2].dishes).toHaveLength(1);
  });
});

describe('the menu density', () => {
  const sized = (count: number, dishes: number) =>
    tvCategories({
      date: '2026-11-03',
      by_category: Array.from({ length: count }, (_, index) =>
        category(
          index,
          Array.from({ length: dishes }, (_, n) => ({ id: index * 10 + n }))
        )
      ),
    });

  it('keeps the largest text for a usual menu', () => {
    expect(menuDensity(sized(4, 3), false)).toBe(0);
  });

  it('shrinks a long menu, less on an upright screen', () => {
    expect(menuDensity(sized(6, 4), false)).toBe(3);
    expect(menuDensity(sized(6, 4), true)).toBe(2);
  });
});

describe('the screen settings', () => {
  it('reads a quarter turn either way, and nothing else', () => {
    expect([rotationOf('90'), rotationOf('270'), rotationOf('45'), rotationOf(null)]).toEqual([
      90, 270, 0, 0,
    ]);
  });

  it('marks the link of the QR code', () => {
    expect(screenQrUrl('https://demo.mariam.app/sciences')).toBe(
      'https://demo.mariam.app/sciences?utm_source=tv&utm_medium=qr'
    );
  });

  it('reloads at half past three, Paris time', () => {
    expect(nextReloadDelay(new Date('2026-11-03T02:00:00Z'))).toBe(30 * 60_000);
    expect(nextReloadDelay(new Date('2026-11-03T02:31:00Z'))).toBe((23 * 60 + 59) * 60_000);
  });

  it('reopens on the next service day', () => {
    expect(reopeningDay('2026-11-06', [0, 1, 2, 3, 4])).toBe('2026-11-09');
  });
});

describe('visits from the screen', () => {
  it('counts a scan apart from the day it opens', () => {
    expect(visitKind(true, '2026-11-03', '2026-11-03')).toBe('screen_qr');
    expect(visitKind(false, '2026-11-03', '2026-11-03')).toBe('today');
    expect(visitKind(false, '2026-11-04', '2026-11-03')).toBe('tomorrow');
  });

  it('tells how many came from the QR code, and nothing at zero', () => {
    expect(screenQrLine(0)).toBeNull();
    expect(screenQrLine(42)).toBe('Dont 42 par le QR code des écrans TV.');
  });
});
