export interface CategoryColor {
  bg: string;
  border: string; // The bottom edge that gives the card its depth
  label: string;
  sectionLabel: string;
  sectionBorder: string;
  addBg: string; // The add-a-dish button, at about 10% opacity
  addLabel: string;
}

export const COLOR_KEY_MAP: Record<string, CategoryColor> = {
  indigo: {
    bg: '#4F6BDB',
    border: '#2D49B4',
    label: '#FFFFFF',
    sectionLabel: '#2D49B4',
    sectionBorder: '#B8C6F5',
    addBg: '#4F6BDB1A',
    addLabel: '#2D49B4',
  },
  sky: {
    bg: '#6FA8E8',
    border: '#3F7FC7',
    label: '#FFFFFF',
    sectionLabel: '#3F7FC7',
    sectionBorder: '#BAD5F5',
    addBg: '#6FA8E81A',
    addLabel: '#3F7FC7',
  },
  mint: {
    bg: '#6FC3A5',
    border: '#3E9F7D',
    label: '#FFFFFF',
    sectionLabel: '#3E9F7D',
    sectionBorder: '#B5E4D4',
    addBg: '#6FC3A51A',
    addLabel: '#3E9F7D',
  },
  saffron: {
    bg: '#F5A524',
    border: '#C97D00',
    label: '#4A2E00',
    sectionLabel: '#C97D00',
    sectionBorder: '#FFD98E',
    addBg: '#F5A5241A',
    addLabel: '#C97D00',
  },
  clay: {
    bg: '#D97A5A',
    border: '#B04C2A',
    label: '#FFFFFF',
    sectionLabel: '#B04C2A',
    sectionBorder: '#F0C4B5',
    addBg: '#D97A5A1A',
    addLabel: '#B04C2A',
  },
  lilac: {
    bg: '#9E87D1',
    border: '#6E55A8',
    label: '#FFFFFF',
    sectionLabel: '#6E55A8',
    sectionBorder: '#D4CAF0',
    addBg: '#9E87D11A',
    addLabel: '#6E55A8',
  },
};

const CATEGORY_BG_PALETTE: CategoryColor[] = [
  COLOR_KEY_MAP.indigo,
  COLOR_KEY_MAP.sky,
  COLOR_KEY_MAP.mint,
  COLOR_KEY_MAP.saffron,
  COLOR_KEY_MAP.clay,
  COLOR_KEY_MAP.lilac,
];

/** The colour `colorKey` names, else one taken from the palette by `fallbackOrder`. */
export function getCategoryColor(
  colorKey: string | null | undefined,
  fallbackOrder: number
): CategoryColor {
  if (colorKey && COLOR_KEY_MAP[colorKey]) {
    return COLOR_KEY_MAP[colorKey];
  }
  return CATEGORY_BG_PALETTE[fallbackOrder % CATEGORY_BG_PALETTE.length];
}
