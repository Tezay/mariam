import { describe, expect, it } from 'vitest';
import {
  declarationInput,
  declarationProblem,
  suggestedYear,
  type DeclarationForm,
} from '@/pages/admin/public-page/egalim-form';

const FORM: DeclarationForm = {
  year: '2025',
  sustainable: '38,3',
  organic: '17.2',
  territorial: '',
};

describe('declarationProblem', () => {
  it('accepts the shares of a bilan, comma or dot', () => {
    expect(declarationProblem(FORM, 2026, [])).toBeNull();
    expect(declarationInput(FORM)).toEqual({
      sustainable_share: 38.3,
      organic_share: 17.2,
      territorial_share: null,
    });
  });

  it.each([
    ['a year before EGalim', { year: '2018' }],
    ['a year to come', { year: '2027' }],
    ['two decimals', { sustainable: '38,25' }],
    ['more than all purchases', { sustainable: '100,1' }],
    ['a missing share', { organic: '' }],
    ['an organic share above the sustainable one', { organic: '40' }],
    ['a territorial share out of range', { territorial: '120' }],
  ])('refuses %s', (_, changes) => {
    expect(declarationProblem({ ...FORM, ...changes }, 2026, [])).not.toBeNull();
  });

  it('refuses a year already declared', () => {
    expect(declarationProblem(FORM, 2026, [2025])).toMatch(/déjà déclarée/);
  });
});

describe('suggestedYear', () => {
  it('suggests the latest year not yet declared', () => {
    expect(suggestedYear(2026, [])).toBe('2025');
    expect(suggestedYear(2026, [2025, 2024])).toBe('2023');
  });
});
