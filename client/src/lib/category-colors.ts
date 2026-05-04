export interface CategoryColor {
    bg: string;           // fond de la card (saturé)
    border: string;       // border-bottom de la card (plus foncé, effet 3D)
    label: string;        // texte sur la card ('#FFFFFF' ou '#4A2E00' pour le saffron)
    sectionLabel: string; // couleur du titre de section sur fond blanc
    sectionBorder: string;// ligne décorative du header de section
    addBg: string;        // fond du bouton "Ajouter un plat" (~10% opacité)
    addLabel: string;     // texte du bouton "Ajouter" (lisible sur addBg)
}

/** Map des couleurs disponibles par clé nommée */
export const COLOR_KEY_MAP: Record<string, CategoryColor> = {
    indigo:  { bg: '#4F6BDB', border: '#2D49B4', label: '#FFFFFF', sectionLabel: '#2D49B4', sectionBorder: '#B8C6F5', addBg: '#4F6BDB1A', addLabel: '#2D49B4' },
    sky:     { bg: '#6FA8E8', border: '#3F7FC7', label: '#FFFFFF', sectionLabel: '#3F7FC7', sectionBorder: '#BAD5F5', addBg: '#6FA8E81A', addLabel: '#3F7FC7' },
    mint:    { bg: '#6FC3A5', border: '#3E9F7D', label: '#FFFFFF', sectionLabel: '#3E9F7D', sectionBorder: '#B5E4D4', addBg: '#6FC3A51A', addLabel: '#3E9F7D' },
    saffron: { bg: '#F5A524', border: '#C97D00', label: '#4A2E00', sectionLabel: '#C97D00', sectionBorder: '#FFD98E', addBg: '#F5A5241A', addLabel: '#C97D00' },
    clay:    { bg: '#D97A5A', border: '#B04C2A', label: '#FFFFFF', sectionLabel: '#B04C2A', sectionBorder: '#F0C4B5', addBg: '#D97A5A1A', addLabel: '#B04C2A' },
    lilac:   { bg: '#9E87D1', border: '#6E55A8', label: '#FFFFFF', sectionLabel: '#6E55A8', sectionBorder: '#D4CAF0', addBg: '#9E87D11A', addLabel: '#6E55A8' },
};

/** Palette de fallback cyclique */
const CATEGORY_BG_PALETTE: CategoryColor[] = [
    COLOR_KEY_MAP.indigo,
    COLOR_KEY_MAP.sky,
    COLOR_KEY_MAP.mint,
    COLOR_KEY_MAP.saffron,
    COLOR_KEY_MAP.clay,
    COLOR_KEY_MAP.lilac,
];

/**
 * Retourne la couleur d'une catégorie.
 * Si `colorKey` est défini et connu, l'utilise directement.
 * Sinon, fallback cyclique basé sur `fallbackOrder`.
 */
export function getCategoryColor(colorKey: string | null | undefined, fallbackOrder: number): CategoryColor {
    if (colorKey && COLOR_KEY_MAP[colorKey]) {
        return COLOR_KEY_MAP[colorKey];
    }
    return CATEGORY_BG_PALETTE[fallbackOrder % CATEGORY_BG_PALETTE.length];
}
