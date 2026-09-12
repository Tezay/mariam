/**
 * Name matching that survives a typo.
 *
 * Mirrors `server/app/services/text_match.py`: both must answer the same, since
 * the global search asks the API for dishes and filters everything else here.
 */

/** Unicode decomposition leaves œ and æ alone, and « bœuf » is typed « boeuf ». */
const LIGATURES: Record<string, string> = { œ: 'oe', æ: 'ae' };

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[œæ]/g, (char) => LIGATURES[char])
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A query of three letters or fewer gets no margin: everything is a neighbour. */
function tolerance(token: string, word: string): number {
  if (token.length < 4) return 0;
  return Math.max(token.length, word.length) <= 7 ? 1 : 2;
}

function within(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    if (Math.min(...current) > limit) return false;
    previous = current;
  }
  return previous[b.length] <= limit;
}

/** Whether `name` answers `query`, allowing a typo per word. */
export function fuzzyMatches(name: string, query: string): boolean {
  const haystack = normalize(name);
  const needle = normalize(query);
  if (!needle) return true;
  if (haystack.includes(needle)) return true;

  const words = haystack.split(' ');
  return needle
    .split(' ')
    .every(
      (token) =>
        haystack.includes(token) ||
        words.some((word) => within(token, word, tolerance(token, word)))
    );
}
