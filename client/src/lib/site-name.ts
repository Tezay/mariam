// Kept in step with server/app/utils/site_name.py.
const SITE_NAME_MAX = 50;

export const SITE_NAME_RULE = `Le nom doit faire 1 à ${SITE_NAME_MAX} caractères et ne contenir ni adresse web ni adresse e-mail (« / », « : » et « @ » sont refusés).`;

const ADDRESS = /[/\\:@]|\.\p{L}{2}/u;

export function parseSiteName(value: string): string | null {
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  // Counted in code points, as the server does.
  const length = Array.from(name).length;
  if (length < 1 || length > SITE_NAME_MAX || /\p{C}/u.test(name)) return null;
  return ADDRESS.test(name) ? null : name;
}
