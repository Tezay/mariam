import { addDays } from '@/lib/date-utils';
import { jsDayToMariamDay } from '@/lib/service-utils';
import { SCREEN_QR } from '@/lib/telemetry';
import type { CategorySubstitutionData, DisplayCategory, MenuResponse } from '../menu-types';

type Dish = CategorySubstitutionData['dish'];

export interface TvDish {
  key: string;
  dish: Dish;
  out: boolean;
  substitute: boolean;
}

export interface TvCategory {
  id: number;
  label: string;
  colorKey: string | null | undefined;
  order: number;
  highlighted: boolean;
  dishes: TvDish[];
}

export const MAX_DENSITY = 3;

// Rows a level holds before the menu is expected to overflow, landscape then portrait.
const LEVEL_ROWS = {
  landscape: [18, 24, 32],
  portrait: [22, 30, 38],
};

function displayed(category: DisplayCategory, substitutes: CategorySubstitutionData[]): TvCategory {
  const items = category.items ?? [];
  const dishes: TvDish[] = items.flatMap((item, index) =>
    item.dish
      ? [
          {
            key: `${item.id ?? index}`,
            dish: item.dish,
            out: item.is_out_of_stock ?? false,
            substitute: false,
          },
        ]
      : []
  );
  if (dishes.some((entry) => entry.out)) {
    dishes.push(
      ...substitutes.map((sub) => ({
        key: `sub-${sub.dish.id}`,
        dish: sub.dish,
        out: false,
        substitute: true,
      }))
    );
  }
  return {
    id: category.id,
    label: category.label,
    colorKey: category.color_key,
    order: category.order,
    highlighted: category.is_highlighted,
    dishes,
  };
}

export function tvCategories(menu: MenuResponse): TvCategory[] {
  const substitutes = menu.substitutions ?? {};
  return menu.by_category
    .flatMap((category) =>
      category.subcategories?.length
        ? category.subcategories.map((sub) => ({
            ...sub,
            label: `${category.label} · ${sub.label}`,
            is_highlighted: sub.is_highlighted || category.is_highlighted,
          }))
        : [category]
    )
    .map((category) => displayed(category, substitutes[category.id] ?? []))
    .filter((category) => category.dishes.length > 0);
}

export function menuDensity(categories: TvCategory[], portrait: boolean): number {
  const rows = categories.reduce((sum, category) => sum + category.dishes.length + 1.5, 0);
  const limits = portrait ? LEVEL_ROWS.portrait : LEVEL_ROWS.landscape;
  const level = limits.findIndex((limit) => rows <= limit);
  return level === -1 ? MAX_DENSITY : level;
}

export function reopeningDay(end: string, serviceDays: number[]): string | null {
  for (let offset = 1; offset <= 14; offset += 1) {
    const day = addDays(end, offset);
    if (serviceDays.includes(jsDayToMariamDay(new Date(`${day}T12:00:00Z`).getUTCDay())))
      return day;
  }
  return null;
}

export function rotationOf(value: string | null): 0 | 90 | 270 {
  if (value === '90') return 90;
  if (value === '270') return 270;
  return 0;
}

export function screenQrUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  for (const [key, value] of Object.entries(SCREEN_QR)) url.searchParams.set(key, value);
  return url.toString();
}

const RELOAD_AT_MINUTES = 3 * 60 + 30;

export function nextReloadDelay(now: Date): number {
  const [hour, minute] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .split(':')
    .map(Number);
  let minutes = RELOAD_AT_MINUTES - (hour * 60 + minute);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
}
