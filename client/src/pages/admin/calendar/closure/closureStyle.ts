/** CSS background pour les jours de fermeture exceptionnelle (hachures) */
export const CLOSURE_HATCH_BG =
  'repeating-linear-gradient(45deg, hsl(var(--closure-hatch-a)), hsl(var(--closure-hatch-a)) 3px, hsl(var(--closure-hatch-b)) 3px, hsl(var(--closure-hatch-b)) 6px)';

export const CLOSURE_HATCH_STYLE = { background: CLOSURE_HATCH_BG } as const;
