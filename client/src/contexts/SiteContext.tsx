import { createContext, useContext } from 'react';
import type { SiteRef } from '@/lib/api/sites';

const SiteContext = createContext<SiteRef | null>(null);

export function SiteProvider({ site, children }: { site: SiteRef; children: React.ReactNode }) {
  return <SiteContext.Provider value={site}>{children}</SiteContext.Provider>;
}

export function useSiteRef(): SiteRef {
  const site = useContext(SiteContext);
  if (!site) throw new Error('useSiteRef must be used inside SiteProvider');
  return site;
}

/** For what renders outside a site too, such as the search on the supervisor's pages. */
export function useOptionalSiteRef(): SiteRef | null {
  return useContext(SiteContext);
}
