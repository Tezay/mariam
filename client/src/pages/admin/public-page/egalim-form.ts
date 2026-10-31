import type { EgalimDeclaration, EgalimDeclarationInput } from '@/lib/api/quality';

// The server's FIRST_YEAR (routes/quality.py), checked here before sending.
export const FIRST_EGALIM_YEAR = 2019;

export interface DeclarationForm {
  year: string;
  sustainable: string;
  organic: string;
  territorial: string;
}

export function formOfDeclaration(declaration: EgalimDeclaration): DeclarationForm {
  const text = (share: number | null) => (share == null ? '' : String(share).replace('.', ','));
  return {
    year: String(declaration.year),
    sustainable: text(declaration.sustainable_share),
    organic: text(declaration.organic_share),
    territorial: text(declaration.territorial_share),
  };
}

export function suggestedYear(thisYear: number, declared: number[]): string {
  for (let year = thisYear - 1; year >= FIRST_EGALIM_YEAR; year -= 1) {
    if (!declared.includes(year)) return String(year);
  }
  return '';
}

function share(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,3}([.,]\d)?$/.test(value)) return null;
  const number = Number(value.replace(',', '.'));
  return number <= 100 ? number : null;
}

export function declarationProblem(
  form: DeclarationForm,
  thisYear: number,
  declared: number[]
): string | null {
  const year = Number(form.year);
  if (!Number.isInteger(year) || year < FIRST_EGALIM_YEAR || year > thisYear) {
    return `L'année va de ${FIRST_EGALIM_YEAR} à ${thisYear}.`;
  }
  if (declared.includes(year)) return 'Cette année est déjà déclarée : modifiez-la dans la liste.';
  const sustainable = share(form.sustainable);
  const organic = share(form.organic);
  if (
    sustainable === null ||
    organic === null ||
    (form.territorial.trim() && share(form.territorial) === null)
  ) {
    return 'Chaque part va de 0 à 100 %, au dixième près au plus (ex. 38,3).';
  }
  if (organic > sustainable) return 'La part bio fait partie de la part durable et de qualité.';
  return null;
}

export function declarationInput(form: DeclarationForm): EgalimDeclarationInput {
  return {
    sustainable_share: share(form.sustainable) ?? 0,
    organic_share: share(form.organic) ?? 0,
    territorial_share: form.territorial.trim() ? share(form.territorial) : null,
  };
}
