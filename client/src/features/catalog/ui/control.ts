/**
 * The look the toolbar controls share, so period and sort cannot drift from
 * the rest. The height is 34px rather than a scale step: it is the smallest
 * comfortable size that leaves an icon-only control exactly square.
 */
export const CONTROL_BASE =
  'flex h-[34px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card text-xs sm:gap-2 sm:text-sm';

export const CONTROL = `${CONTROL_BASE} px-2 sm:px-3`;

/** Square while the icon stands alone; call sites say at which width the label joins it. */
export const CONTROL_SQUARE = `${CONTROL_BASE} w-[34px]`;

export const CONTROL_ICON = 'h-3.5 w-3.5 sm:h-4 sm:w-4';
