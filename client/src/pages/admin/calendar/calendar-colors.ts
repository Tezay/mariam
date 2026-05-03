import { generateEventPalette } from '@/lib/color-utils';

// ─── Couleurs menu ───────────────────────────────────────────────────────────

export const MENU_COLORS = {
    published: { bg: '#093EAA', text: '#FFFFFF', border: '#072E80' },
    draft:     { bg: '#EEF2FF', text: '#093EAA', border: '#093EAA' },
};

// ─── Couleurs fermeture (unique — pas de brouillon) ──────────────────────────

export const CLOSURE_COLOR = { bg: '#DC2626', text: '#FFFFFF', border: '#B91C1C' };

// ─── Pattern hachures (brouillon menu/événement) ─────────────────────────────

export function getDraftPattern(color: string): string {
    return `repeating-linear-gradient(45deg, ${color}33 0, ${color}33 1.5px, transparent 0, transparent 8px)`;
}

// ─── Styles de chip par type ─────────────────────────────────────────────────

export interface ChipStyle {
    backgroundColor: string;
    color: string;
    border: string;
    backgroundImage?: string;
}

export function getMenuChipStyle(isDraft: boolean): ChipStyle {
    if (isDraft) {
        return {
            backgroundColor: MENU_COLORS.draft.bg,
            color: MENU_COLORS.draft.text,
            border: `1.5px solid ${MENU_COLORS.draft.border}`,
            backgroundImage: getDraftPattern('#093EAA'),
        };
    }
    return {
        backgroundColor: MENU_COLORS.published.bg,
        color: MENU_COLORS.published.text,
        border: 'none',
    };
}

export function getEventChipStyle(isDraft: boolean, eventColor?: string): ChipStyle {
    const palette = generateEventPalette(eventColor || '#3498DB');
    if (isDraft) {
        return {
            backgroundColor: palette.bg,
            color: palette.text,
            border: `1.5px solid ${palette.border}`,
            backgroundImage: getDraftPattern(palette.border),
        };
    }
    return {
        backgroundColor: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
    };
}

// ─── Couleur de fond de case par priorité ───────────────────────────────────

export function getDayCellTint(hasClosure: boolean): string | undefined {
    return hasClosure ? '#FEE2E2' : undefined;
}
