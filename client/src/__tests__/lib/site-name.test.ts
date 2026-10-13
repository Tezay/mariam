import { describe, it, expect } from 'vitest';
import { parseSiteName } from '@/lib/site-name';

describe('parseSiteName', () => {
  it.each([
    "Resto U' Créteil",
    'RU n°2 – bât. B',
    'R.U. Nord',
    'Crous & Go (Saclay)',
    'x'.repeat(50),
  ])('keeps %s', (name) => {
    expect(parseSiteName(name)).toBe(name);
  });

  it('trims and collapses whitespace', () => {
    expect(parseSiteName('  RU \n  Nord ')).toBe('RU Nord');
  });

  it.each([
    '',
    '   ',
    'x'.repeat(51),
    'RU https://exemple.com',
    'exemple.com',
    'www.exemple.com',
    'contact@exemple',
    'RU Nord/Sud',
    'RU Nord\\Sud',
    'RU : Nord',
    'St.Denis',
    'RU\u0000Nord',
  ])('refuses %j', (name) => {
    expect(parseSiteName(name)).toBeNull();
  });
});
