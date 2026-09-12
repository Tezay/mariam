import { describe, it, expect } from 'vitest';
import { fuzzyMatches, normalize } from '@/lib/fuzzy';

describe('normalize', () => {
  it('folds case, accents, ligatures and spacing', () => {
    expect(normalize('  Bœuf   BOURGUIGNON ')).toBe('boeuf bourguignon');
    expect(normalize('Carottes râpées')).toBe('carottes rapees');
  });
});

describe('fuzzyMatches', () => {
  it('finds a name typed with one mistake', () => {
    expect(fuzzyMatches('Banane', 'bannane')).toBe(true);
    expect(fuzzyMatches('Blanquette de veau', 'blanquete')).toBe(true);
    expect(fuzzyMatches('Bœuf bourguignon', 'boeuf bourgignon')).toBe(true);
  });

  it('still matches exactly and by substring', () => {
    expect(fuzzyMatches('Tarte aux pommes', 'tarte')).toBe(true);
    expect(fuzzyMatches('Tarte aux pommes', 'TARTE POMME')).toBe(true);
    expect(fuzzyMatches('Banane', '')).toBe(true);
  });

  it('keeps short words exact and unrelated names out', () => {
    expect(fuzzyMatches('Ris de veau', 'riz')).toBe(false);
    expect(fuzzyMatches('Bœuf', 'bob')).toBe(false);
    expect(fuzzyMatches('Banane', 'pomme')).toBe(false);
  });

  it('requires every word of the query to match', () => {
    expect(fuzzyMatches('Tarte aux pommes', 'tarte poulet')).toBe(false);
  });
});
