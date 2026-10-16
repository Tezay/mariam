import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

function reservedSlugs(): Set<string> {
  const block = read('../server/app/utils/slug.py').match(
    /RESERVED_SLUGS = frozenset\(\{([^}]*)\}\)/
  );
  if (!block) throw new Error('RESERVED_SLUGS not found in slug.py');
  return new Set([...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]));
}

function firstSegments(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1].split('/')[0]);
}

// A site whose slug is also a page would never be reachable.
describe('reserved slugs', () => {
  const slugShaped = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const segments = [
    ...firstSegments(read('src/routes.ts'), /route\('([^']+)'/g),
    ...firstSegments(read('src/App.tsx'), /path="\/([^"]+)"/g),
    ...firstSegments(read('server.js'), /app\.(?:get|use)\('\/([^']+)'/g),
  ].filter((segment) => slugShaped.test(segment));

  it('cover the first segment of every page the frontend serves', () => {
    const reserved = reservedSlugs();
    expect(segments.length).toBeGreaterThan(5);
    expect(segments.filter((segment) => !reserved.has(segment))).toEqual([]);
  });
});
