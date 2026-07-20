/**
 * MARIAM - Affichage public du menu
 *
 * Orchestrateur : détecte le mode TV (>= 1920px ou ?mode=tv) et délègue à
 * TvMenuDisplay ou MobileMenuDisplay pour le restaurant résolu (slug).
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { useDocumentMeta } from '@/lib/use-document-meta';
import { TvMenuDisplay } from './tv/TvMenuDisplay';
import { MobileMenuDisplay } from './mobile/MobileMenuDisplay';

export function MenuDisplay({ restaurantSlug }: { restaurantSlug: string }) {
  const [searchParams] = useSearchParams();
  const forceTvMode = searchParams.get('mode') === 'tv';
  const [isTvMode, setIsTvMode] = useState(forceTvMode);

  const { organization, sites } = useTenant();
  const siteName = sites.find((s) => s.slug === restaurantSlug)?.name;
  useDocumentMeta({
    title: siteName && organization ? `Menu ${siteName} — ${organization.name}` : undefined,
  });

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

  return isTvMode ? (
    <TvMenuDisplay restaurantSlug={restaurantSlug} />
  ) : (
    <MobileMenuDisplay restaurantSlug={restaurantSlug} />
  );
}
