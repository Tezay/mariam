import type { CSSProperties } from 'react';
import type { CategoryColor } from '@/lib/category-colors';

// Passed as variables: an inline colour could not change with the `dark` class.
export function sectionColors(color: CategoryColor): CSSProperties {
  return {
    '--section-label': color.sectionLabel,
    '--section-label-dark': color.sectionLabelDark,
    '--section-rule': color.sectionBorder,
    '--section-rule-dark': color.sectionBorderDark,
  } as CSSProperties;
}

export const SECTION_LABEL =
  'text-[color:var(--section-label)] dark:text-[color:var(--section-label-dark)]';
export const SECTION_RULE =
  'bg-[color:var(--section-rule)] dark:bg-[color:var(--section-rule-dark)]';
