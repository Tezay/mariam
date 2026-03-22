/**
 * MARIAM — PWA Install Context
 *
 * Captures the `beforeinstallprompt` event globally (once, at app level)
 * so any component can trigger the native install prompt without re-capturing.
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { isPwaInstalled } from '@/lib/push';

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

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
    const [isInstalled, setIsInstalled] = useState(isPwaInstalled());

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            setInstallPrompt(e as BeforeInstallPromptEvent);
        };
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
