import { describe, it, expect } from 'vitest';
import { getCategoryColor, COLOR_KEY_MAP } from '@/lib/category-colors';

describe('getCategoryColor', () => {
    it('returns the correct color for a known key', () => {
        const color = getCategoryColor('indigo', 0);
        expect(color).toEqual(COLOR_KEY_MAP.indigo);
    });

    it('returns the correct color for each named key', () => {
        for (const key of Object.keys(COLOR_KEY_MAP)) {
            const color = getCategoryColor(key, 0);
            expect(color).toEqual(COLOR_KEY_MAP[key]);
        }
    });

    it('falls back to cyclic palette when key is null', () => {
        const color0 = getCategoryColor(null, 0);
        const color1 = getCategoryColor(null, 1);
        expect(color0).not.toEqual(color1);
        // Wraps around after 6 entries
        const color6 = getCategoryColor(null, 6);
        expect(color6).toEqual(color0);
    });

    it('falls back to cyclic palette when key is undefined', () => {
        const color = getCategoryColor(undefined, 2);
        expect(color).toEqual(COLOR_KEY_MAP.mint);
    });

    it('falls back for an unknown key string', () => {
        const color = getCategoryColor('unknown-key', 1);
        expect(color).toEqual(COLOR_KEY_MAP.sky);
    });

    it('each color has all required fields', () => {
        const required = ['bg', 'border', 'label', 'sectionLabel', 'sectionBorder', 'addBg', 'addLabel'];
        for (const key of Object.keys(COLOR_KEY_MAP)) {
            const color = getCategoryColor(key, 0);
            for (const field of required) {
                expect(color).toHaveProperty(field);
            }
        }
    });
});
