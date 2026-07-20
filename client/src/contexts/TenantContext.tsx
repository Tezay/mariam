/**
 * TenantContext — bootstraps the organization from the request Host
 * (subdomain = organization) via GET /v1/public/org, and exposes its sites.
 *
 * An organization with a single site runs in "mono-site" mode (root URL serves
 * that site directly); with several sites it runs in "multi-site" mode (root
 * lists the sites, each reachable at /:slug/menu).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { publicApi, type PublicOrg, type PublicSite } from '@/lib/api';

interface TenantState {
  loading: boolean;
  error: boolean;
  organization: PublicOrg['organization'] | null;
  sites: PublicSite[];
  isMultiSite: boolean;
  /** Slug of the single site in mono-site mode, else null. */
  monoSlug: string | null;
}

const TenantContext = createContext<TenantState | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TenantState>({
    loading: true,
    error: false,
    organization: null,
    sites: [],
    isMultiSite: false,
    monoSlug: null,
  });

  useEffect(() => {
    let cancelled = false;
    publicApi
      .getOrg()
      .then((data) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: false,
          organization: data.organization,
          sites: data.sites,
          isMultiSite: data.sites.length > 1,
          monoSlug: data.sites.length >= 1 ? data.sites[0].slug : null,
        });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <TenantContext.Provider value={state}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within a TenantProvider');
  return ctx;
}
