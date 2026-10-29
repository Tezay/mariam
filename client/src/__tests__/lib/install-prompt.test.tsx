import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PwaInstallProvider, usePwaInstall } from '@/contexts/PwaInstallContext';

const script = readFileSync(
  path.resolve(import.meta.dirname, '../../../public/install-prompt.js'),
  'utf8'
);

function Offer() {
  return <p>{usePwaInstall().installPrompt ? 'offered' : 'none'}</p>;
}

describe('install-prompt.js', () => {
  it('keeps the offer Chrome makes before React mounts', () => {
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    new Function(script)();
    const offer = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(offer);

    render(
      <PwaInstallProvider>
        <Offer />
      </PwaInstallProvider>
    );

    expect(offer.defaultPrevented).toBe(true);
    expect(screen.getByText('offered')).toBeDefined();
  });
});
