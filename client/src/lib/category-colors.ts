export interface CategoryColor {
    bg: string;           // fond de la card (saturé)
    border: string;       // border-bottom de la card (plus foncé, effet 3D)
    label: string;        // texte sur la card ('#FFFFFF' ou '#78570A' pour le jaune)
    sectionLabel: string; // couleur du titre de section sur fond blanc
    sectionBorder: string;// ligne décorative du header de section
    addBg: string;        // fond du bouton "Ajouter un plat" (~10% opacité)
    addLabel: string;     // texte du bouton "Ajouter" (lisible sur addBg)
}

/** Map des couleurs disponibles par clé nommée */
export const COLOR_KEY_MAP: Record<string, CategoryColor> = {
    green:  { bg: '#58CC02', border: '#46A302', label: '#FFFFFF', sectionLabel: '#166534', sectionBorder: '#BBF7D0', addBg: '#58CC021A', addLabel: '#166534' },
    blue:   { bg: '#1CB0F6', border: '#168CB5', label: '#FFFFFF', sectionLabel: '#1E40AF', sectionBorder: '#BFDBFE', addBg: '#1CB0F61A', addLabel: '#1E40AF' },
    purple: { bg: '#CE82FF', border: '#A550E6', label: '#FFFFFF', sectionLabel: '#7E22CE', sectionBorder: '#E9D5FF', addBg: '#CE82FF1A', addLabel: '#7E22CE' },
    yellow: { bg: '#FFD900', border: '#CCAD00', label: '#78570A', sectionLabel: '#92400E', sectionBorder: '#FDE68A', addBg: '#FFD9001A', addLabel: '#92400E' },
    teal:   { bg: '#00CD9C', border: '#00A47E', label: '#FFFFFF', sectionLabel: '#0F766E', sectionBorder: '#99F6E4', addBg: '#00CD9C1A', addLabel: '#0F766E' },
    slate:  { bg: '#8499B3', border: '#5F7A96', label: '#FFFFFF', sectionLabel: '#334155', sectionBorder: '#E2E8F0', addBg: '#8499B31A', addLabel: '#334155' },
};

/** Palette de fallback cyclique */
const CATEGORY_BG_PALETTE: CategoryColor[] = [
    COLOR_KEY_MAP.green,
    COLOR_KEY_MAP.blue,
    COLOR_KEY_MAP.purple,
    COLOR_KEY_MAP.yellow,
    COLOR_KEY_MAP.teal,
    COLOR_KEY_MAP.slate,
];

/** Couleur fixe pour les catégories / sous-catégories highlight */
export const HIGHLIGHTED_COLOR: CategoryColor = {
    bg: '#FFFFFF',
    border: '#001BB7',
    label: '#001BB7',
    sectionLabel: '#001BB7',
    sectionBorder: '#001BB7',
    addBg: '#F0F3FF',
    addLabel: '#093EAA',
};

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
