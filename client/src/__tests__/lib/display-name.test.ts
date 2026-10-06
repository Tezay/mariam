import { describe, it, expect } from 'vitest';
import { parseDisplayName } from '@/lib/display-name';

describe('parseDisplayName', () => {
  it.each(['Jean Dupont', "Anne-Marie O'Neil", 'Zoë', 'J. Dupont', 'Юлия'])('keeps %s', (name) => {
    expect(parseDisplayName(name)).toBe(name);
  });

  it('trims and collapses whitespace', () => {
    expect(parseDisplayName('  Jean   Dupont ')).toBe('Jean Dupont');
  });

  it('composes a decomposed accent before judging it', () => {
    expect(parseDisplayName('Zoe\u0308')).toBe('Zo\u00eb');
  });

  it.each(['', 'J', 'x'.repeat(51), 'jean@mariam.app', 'Agent 007', 'Jean²', '-Jean'])(
    'refuses %j',
    (name) => {
      expect(parseDisplayName(name)).toBeNull();
    }
  );
});
