/**
 * MARIAM - Affichage public du menu
 *
 * Orchestrateur : détecte le mode TV (>= 1920px ou ?mode=tv)
 * et délègue à TvMenuDisplay ou MobileMenuDisplay.
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TvMenuDisplay } from './tv/TvMenuDisplay';
import { MobileMenuDisplay } from './mobile/MobileMenuDisplay';

export function MenuDisplay() {
    const [searchParams] = useSearchParams();
    const forceTvMode = searchParams.get('mode') === 'tv';
    const [isTvMode, setIsTvMode] = useState(forceTvMode);

    useEffect(() => {
        if (forceTvMode) {
            setIsTvMode(true);
            return;
        }
        const check = () => setIsTvMode(window.innerWidth >= 1920);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [forceTvMode]);

    return isTvMode ? <TvMenuDisplay /> : <MobileMenuDisplay />;
}
