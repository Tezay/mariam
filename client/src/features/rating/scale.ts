import { Frown, Laugh, Smile, Star, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';

/**
 * The three rating levels and the icon sets that draw them, defined once for
 * the student widget and the dashboards. Nothing else may hardcode an icon or a
 * label for a rating.
 *
 * The middle level is positive on purpose: a neutral one empties the top of
 * its meaning.
 */
export type RatingValue = 1 | 2 | 3;

export interface RatingLevel {
  value: RatingValue;
  label: string;
  /** Chart colour; the widget stays on the brand palette. */
  color: string;
}

export const RATING_LEVELS: RatingLevel[] = [
  { value: 1, label: "Je n'ai pas aimé", color: 'hsl(var(--color-error))' },
  { value: 2, label: "J'ai aimé", color: 'hsl(var(--color-warning))' },
  { value: 3, label: "J'ai adoré", color: 'hsl(var(--color-success))' },
];

interface RatingIcon {
  Icon: LucideIcon;
  count: number;
}

export interface RatingPreset {
  id: string;
  label: string;
  icons: Record<RatingValue, RatingIcon>;
}

/** Keep the identifiers in step with VOTE_ICON_PRESETS on the server. */
export const RATING_PRESETS: RatingPreset[] = [
  {
    id: 'thumbs',
    label: 'Pouces',
    icons: {
      1: { Icon: ThumbsDown, count: 1 },
      2: { Icon: ThumbsUp, count: 1 },
      3: { Icon: ThumbsUp, count: 2 },
    },
  },
  {
    id: 'faces',
    label: 'Visages',
    icons: {
      1: { Icon: Frown, count: 1 },
      2: { Icon: Smile, count: 1 },
      3: { Icon: Laugh, count: 1 },
    },
  },
  {
    id: 'stars',
    label: 'Étoiles',
    icons: {
      1: { Icon: Star, count: 1 },
      2: { Icon: Star, count: 2 },
      3: { Icon: Star, count: 3 },
    },
  },
];

export const DEFAULT_PRESET_ID = RATING_PRESETS[0].id;

export function ratingPreset(id: string | undefined): RatingPreset {
  return RATING_PRESETS.find((preset) => preset.id === id) ?? RATING_PRESETS[0];
}

export function ratingLevel(value: number | null | undefined): RatingLevel | undefined {
  return RATING_LEVELS.find((level) => level.value === value);
}

/** Rounds a mean to the nearest level, for a headline that names a score. */
export function nearestLevel(score: number | null | undefined): RatingLevel | undefined {
  if (score === null || score === undefined) return undefined;
  return ratingLevel(Math.min(3, Math.max(1, Math.round(score))) as RatingValue);
}
