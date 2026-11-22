import { createContext, useCallback, useContext } from 'react';
import type { SiteRef } from '@/lib/api/sites';
import { sitePath } from '@/lib/dashboard-routes';

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

/** A page of the open site's dashboard: `page` is its path below the site, such as `/calendar`. */
export function useSitePage(): (page: string) => string {
  const site = useSiteRef();
  return useCallback((page: string) => sitePath(site, page), [site]);
}
