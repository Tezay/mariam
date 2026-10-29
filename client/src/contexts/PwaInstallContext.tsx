import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { detectPlatform, installMethod, isPwaInstalled, isSafari } from '@/lib/app-install';

interface PwaInstallContextValue {
  installPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
  triggerInstall: () => Promise<'accepted' | 'dismissed'>;
}

const PwaInstallContext = createContext<PwaInstallContextValue>({
  installPrompt: null,
  isInstalled: false,
  triggerInstall: async () => 'dismissed',
});

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // Read once mounted: the server renders the public pages and knows no display mode.
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setIsInstalled(isPwaInstalled());
    setInstallPrompt(window.__installPrompt ?? null);
    const handler = (e: Event) => setInstallPrompt(e as BeforeInstallPromptEvent);
    window.addEventListener('beforeinstallprompt', handler);

    const appInstalledHandler = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('appinstalled', appInstalledHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', appInstalledHandler);
    };
  }, []);

  const triggerInstall = useCallback(async (): Promise<'accepted' | 'dismissed'> => {
    if (!installPrompt) return 'dismissed';
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setIsInstalled(true);
      window.__installPrompt = null;
      setInstallPrompt(null);
      return outcome;
    } catch {
      return 'dismissed';
    }
  }, [installPrompt]);

  return (
    <PwaInstallContext.Provider value={{ installPrompt, isInstalled, triggerInstall }}>
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall() {
  return useContext(PwaInstallContext);
}

export function useInstallMethod() {
  const { installPrompt, isInstalled } = usePwaInstall();
  return installMethod({
    platform: detectPlatform(),
    installed: isInstalled,
    offer: installPrompt !== null,
    // Declared by Chromium even when it has no offer to make.
    chromium: 'onbeforeinstallprompt' in window,
    safari: isSafari(),
  });
}
