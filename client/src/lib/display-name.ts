export const DISPLAY_NAME_RULE = '2 à 50 caractères : lettres, espaces, tirets, apostrophes.';

// Kept in step with server/app/utils/display_name.py.
const PATTERN = /^\p{L}[\p{L} .'’-]*$/u;

export function parseDisplayName(value: string): string | null {
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  // Counted in code points, as the server does.
  const length = Array.from(name).length;
  return length >= 2 && length <= 50 && PATTERN.test(name) ? name : null;
}
