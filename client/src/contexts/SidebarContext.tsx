import { createContext, useContext, useState, useCallback } from 'react';

interface SidebarContextType {
    isCollapsed: boolean;
    toggle: () => void;
    isMobileOpen: boolean;
    setMobileOpen: (open: boolean) => void;
    /** Mode immersif : masque la bottom navbar mobile (onboarding plein écran). */
    immersive: boolean;
    setImmersive: (immersive: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

const STORAGE_KEY = 'mariam-sidebar-collapsed';

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(
        () => localStorage.getItem(STORAGE_KEY) === 'true'
    );
    const [isMobileOpen, setMobileOpen] = useState(false);
    const [immersive, setImmersive] = useState(false);

    const toggle = useCallback(() => {
        setIsCollapsed(prev => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
        });
    }, []);

    return (
        <SidebarContext.Provider value={{ isCollapsed, toggle, isMobileOpen, setMobileOpen, immersive, setImmersive }}>
            {children}
        </SidebarContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components -- contexte + hook co-localisés volontairement
export function useSidebar() {
    const ctx = useContext(SidebarContext);
    if (!ctx) throw new Error('useSidebar must be used inside SidebarProvider');
    return ctx;
}
