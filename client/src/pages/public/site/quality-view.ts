import type { EgalimDeclaration, Quality } from '@/lib/api/quality';

type Label = Quality['labels'][number];

const MENU_LINES = [
  ['labelled', 'Plats portant un label'],
  ['homemade', 'Faits maison'],
  ['local', 'Produits locaux'],
  ['seasonal', 'Produits de saison'],
  ['vegetarian', 'Plats végétariens'],
] as const;

export interface QualityView {
  declaration: EgalimDeclaration | null;
  menuLines: { label: string; share: number }[];
  labels: Label[];
  commitments: string | null;
}

function isDeclaration(value: Quality['declaration'] | undefined): value is EgalimDeclaration {
  return value != null && 'year' in value;
}

export function qualityView(
  quality: Quality | null,
  commitments: string | null
): QualityView | null {
  const declaration = isDeclaration(quality?.declaration) ? quality.declaration : null;
  const menus = quality?.menus;
  const menuLines = MENU_LINES.flatMap(([key, label]) => {
    const share = menus?.[key];
    return typeof share === 'number' && share > 0 ? [{ label, share }] : [];
  });
  const labels = quality?.labels ?? [];
  if (!declaration && menuLines.length === 0 && labels.length === 0 && !commitments) return null;
  return { declaration, menuLines, labels, commitments };
}

export function formatShare(share: number): string {
  return `${share.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}\u00a0%`;
}
