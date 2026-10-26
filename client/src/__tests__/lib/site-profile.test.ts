import { describe, it, expect } from 'vitest';
import { linkProblem, type SiteLink } from '@/lib/site-profile';

const WEBSITE: SiteLink = {
  kind: 'website',
  url: 'https://www.crous-demo.fr',
  label: 'Site du Crous',
};

describe('linkProblem', () => {
  it.each<SiteLink>([
    WEBSITE,
    { kind: 'izly', url: 'https://mon-espace.izly.fr', label: null },
    { kind: 'youtube', url: 'https://youtu.be/abc', label: null },
    { kind: 'x', url: 'https://twitter.com/crous', label: null },
  ])('lets $kind through at $url', (link) => {
    expect(linkProblem(link)).toBeNull();
  });

  it.each<[string, SiteLink]>([
    ['an http address', { ...WEBSITE, url: 'http://www.crous-demo.fr' }],
    ['credentials', { ...WEBSITE, url: 'https://admin:secret@www.crous-demo.fr' }],
    ['no address at all', { ...WEBSITE, url: '' }],
    ['a website without its name', { ...WEBSITE, label: '  ' }],
    [
      'Instagram on a path elsewhere',
      { kind: 'instagram', url: 'https://evil.example/instagram.com', label: null },
    ],
    [
      'Instagram as a prefix of another host',
      { kind: 'instagram', url: 'https://instagram.com.evil.example', label: null },
    ],
  ])('refuses %s, as the server does', (_, link) => {
    expect(linkProblem(link)).not.toBeNull();
  });
});
