/**
 * Tenant-aware public routing.
 *
 * Mono-site organization: root serves the single site's menu (`/menu`), and
 * `/:slug/menu` redirects to it. Multi-site: root lists the sites, each menu at
 * `/:slug/menu`.
 */
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { TenantProvider, useTenant } from '@/contexts/TenantContext';
import { MenuDisplay } from './MenuDisplay';
import { SiteListPage } from './SiteListPage';

export function TenantLayout() {
  return (
    <TenantProvider>
      <Outlet />
    </TenantProvider>
  );
}

function TenantLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
    </div>
  );
}

function TenantError() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6 text-center font-sans text-slate-500">
      Organisation introuvable.
    </div>
  );
}

export function PublicRoot() {
  const { loading, error, isMultiSite } = useTenant();
  if (loading) return <TenantLoading />;
  if (error) return <TenantError />;
  if (isMultiSite) return <SiteListPage />;
  return <Navigate to="/menu" replace />;
}

export function MonoMenu() {
  const { loading, error, isMultiSite, monoSlug } = useTenant();
  if (loading) return <TenantLoading />;
  if (error || !monoSlug) return <TenantError />;
  if (isMultiSite) return <Navigate to="/" replace />;
  return <MenuDisplay restaurantSlug={monoSlug} />;
}

export function SluggedMenu() {
  const { loading, error, isMultiSite, monoSlug, sites } = useTenant();
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>();
  if (loading) return <TenantLoading />;
  if (error) return <TenantError />;
  // Canonical: in mono-site mode, /:slug/menu redirects to the root menu.
  if (!isMultiSite && restaurantSlug === monoSlug) return <Navigate to="/menu" replace />;
  if (!restaurantSlug || !sites.some((s) => s.slug === restaurantSlug)) return <TenantError />;
  return <MenuDisplay restaurantSlug={restaurantSlug} />;
}
