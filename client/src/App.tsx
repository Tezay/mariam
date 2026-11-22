import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useParams } from 'react-router';
import { Toaster } from 'sonner';
import { useAuth } from './contexts/AuthContext';
import { PwaInstallProvider } from './contexts/PwaInstallContext';
import { SiteProvider } from './contexts/SiteContext';
import { useTheme } from './contexts/ThemeProvider';
import { PageLoader } from './components/PageLoader';
import { PlaceProvider, usePlace } from './contexts/PlaceContext';
import {
  LANDING_PATH,
  landingPath,
  orgPath,
  placePath,
  placeRole,
  placesOf,
  readLastPlace,
  rememberPlace,
  sitePath,
  siteRole,
  supervises,
} from './lib/dashboard-routes';

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Activate = lazy(() => import('./pages/Activate').then((m) => ({ default: m.Activate })));
const ResetPassword = lazy(() =>
  import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword }))
);
const Unsubscribe = lazy(() =>
  import('./pages/Unsubscribe').then((m) => ({ default: m.Unsubscribe }))
);
const AdminLayout = lazy(() =>
  import('./components/AdminLayout').then((m) => ({ default: m.AdminLayout }))
);
const UsersPage = lazy(() =>
  import('./pages/admin/UsersPage').then((m) => ({ default: m.UsersPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const PublicPagePage = lazy(() =>
  import('./pages/admin/PublicPagePage').then((m) => ({ default: m.PublicPagePage }))
);
const AuditLogsPage = lazy(() =>
  import('./pages/admin/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage }))
);
const AccountPage = lazy(() =>
  import('./pages/account/AccountPage').then((m) => ({ default: m.AccountPage }))
);
const NewsPage = lazy(() =>
  import('./pages/admin/NewsPage').then((m) => ({ default: m.NewsPage }))
);
const ClosuresPage = lazy(() =>
  import('./pages/admin/ClosuresPage').then((m) => ({ default: m.ClosuresPage }))
);
const ServicePage = lazy(() =>
  import('./pages/admin/ServicePage').then((m) => ({ default: m.ServicePage }))
);
const SecurityPage = lazy(() => import('./pages/admin/SecurityPage'));
const InstallPage = lazy(() =>
  import('./pages/admin/InstallPage').then((m) => ({ default: m.InstallPage }))
);
const SetupTransferPage = lazy(() =>
  import('./pages/admin/SetupTransferPage').then((m) => ({ default: m.SetupTransferPage }))
);
const Landing = lazy(() => import('./pages/PlacesPage').then((m) => ({ default: m.Landing })));
const CalendarPage = lazy(() =>
  import('./pages/admin/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage }))
);
const OrgLayout = lazy(() =>
  import('./pages/org/OrgLayout').then((m) => ({ default: m.OrgLayout }))
);
const StatsPage = lazy(() =>
  import('./pages/admin/StatsPage').then((m) => ({ default: m.StatsPage }))
);
const OrgOverviewPage = lazy(() =>
  import('./pages/org/OrgOverviewPage').then((m) => ({ default: m.OrgOverviewPage }))
);
const OrgTrafficPage = lazy(() =>
  import('./pages/org/analytics/TrafficPage').then((m) => ({ default: m.OrgTrafficPage }))
);
const OrgSatisfactionPage = lazy(() =>
  import('./pages/org/analytics/SatisfactionPage').then((m) => ({
    default: m.OrgSatisfactionPage,
  }))
);
const OrgPublicationsPage = lazy(() =>
  import('./pages/org/analytics/PublicationsPage').then((m) => ({
    default: m.OrgPublicationsPage,
  }))
);
const OrgSitesPage = lazy(() =>
  import('./pages/org/OrgSitesPage').then((m) => ({ default: m.OrgSitesPage }))
);
const ComparePage = lazy(() =>
  import('./pages/admin/catalogue/ComparePage').then((m) => ({ default: m.ComparePage }))
);
const OrgCatalogPage = lazy(() =>
  import('./pages/org/OrgCatalogPage').then((m) => ({ default: m.OrgCatalogPage }))
);
const OrgSiteDetailPage = lazy(() =>
  import('./pages/org/OrgSiteDetailPage').then((m) => ({ default: m.OrgSiteDetailPage }))
);
const NewsEditPage = lazy(() =>
  import('./pages/admin/NewsEditPage').then((m) => ({ default: m.NewsEditPage }))
);
const CataloguePage = lazy(() =>
  import('./pages/admin/CataloguePage').then((m) => ({ default: m.CataloguePage }))
);
const DishDetailPage = lazy(() =>
  import('./pages/admin/catalogue/DishDetailPage').then((m) => ({ default: m.DishDetailPage }))
);

import { NotFound, Forbidden } from './pages/errors';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  return usePlace().role === 'admin' ? <>{children}</> : <Forbidden />;
}

// Former addresses (/admin/calendar) name no site the account holds: they lead to the landing.
function SiteRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { org = '', site = '' } = useParams();
  const role = user ? siteRole(user, { org, site }) : null;
  const value = useMemo(
    () => (role ? { place: { kind: 'site' as const, org, site }, role } : null),
    [org, site, role]
  );
  useEffect(() => {
    if (value) rememberPlace(value.place);
  }, [value]);

  if (!value) return <Navigate to={LANDING_PATH} replace />;
  return (
    <PlaceProvider value={value}>
      <SiteProvider site={value.place}>{children}</SiteProvider>
    </PlaceProvider>
  );
}

function OrgRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { org = '' } = useParams();
  const held = !!user && supervises(user, org);
  const value = useMemo(
    () => (held ? { place: { kind: 'org' as const, org }, role: 'org_admin' as const } : null),
    [org, held]
  );
  useEffect(() => {
    if (value) rememberPlace(value.place);
  }, [value]);

  if (!value) return <Navigate to={LANDING_PATH} replace />;
  return <PlaceProvider value={value}>{children}</PlaceProvider>;
}

function OrgSitesRoute() {
  const { user } = useAuth();
  const { org = '' } = useParams();
  const sites = user?.sites.filter((s) => s.organization.slug === org) ?? [];
  const target = sites.length === 1 ? sitePath({ org, site: sites[0].slug }) : LANDING_PATH;
  return <Navigate to={target} replace />;
}

function SupervisionRoute() {
  const { user } = useAuth();
  const last = readLastPlace();
  const org =
    (last?.kind === 'org' && user?.organizations.some((o) => o.slug === last.org) && last.org) ||
    user?.organizations[0]?.slug;
  return <Navigate to={org ? orgPath(org) : LANDING_PATH} replace />;
}

// One page in the frame of the place the account lands on.
function AccountLayout() {
  const { user } = useAuth();
  const places = user ? placesOf(user) : [];
  const target = user && landingPath(user, readLastPlace());
  const place = places.find((p) => placePath(p) === target) ?? places[0];
  const role = user && place && placeRole(user, place);
  if (!place || !role) return <Outlet />;
  return (
    <PlaceProvider value={{ place, role }}>
      {place.kind === 'site' ? (
        <SiteProvider site={place}>
          <AdminLayout />
        </SiteProvider>
      ) : (
        <OrgLayout />
      )}
    </PlaceProvider>
  );
}

// Sends a signed-in user to the dashboard.
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (isAuthenticated) {
    return <Navigate to={LANDING_PATH} replace />;
  }

  return <>{children}</>;
}

function ResponsiveToaster() {
  const { resolvedTheme } = useTheme();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return (
    <Toaster
      theme={resolvedTheme}
      position={isMobile ? 'top-center' : 'bottom-right'}
      richColors
      closeButton
    />
  );
}

function App() {
  return (
    <PwaInstallProvider>
      <ResponsiveToaster />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />

          <Route path="/activate/:token" element={<Activate />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/unsubscribe/:token" element={<Unsubscribe />} />
          <Route path="/admin/setup" element={<SetupTransferPage />} />

          {['/admin/security', '/org/security'].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                <ProtectedRoute>
                  <SecurityPage />
                </ProtectedRoute>
              }
            />
          ))}
          {['/admin/install', '/org/install'].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                <ProtectedRoute>
                  <InstallPage />
                </ProtectedRoute>
              }
            />
          ))}

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <Landing />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/account"
            element={
              <ProtectedRoute>
                <AccountLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AccountPage />} />
          </Route>
          <Route
            path="/admin/:org"
            element={
              <ProtectedRoute>
                <OrgSitesRoute />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/:org/:site"
            element={
              <ProtectedRoute>
                <SiteRoute>
                  <AdminLayout />
                </SiteRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<CalendarPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="service" element={<ServicePage />} />
            <Route path="news" element={<NewsPage />} />
            <Route path="news/new" element={<NewsEditPage />} />
            <Route path="news/:id/edit" element={<NewsEditPage />} />
            <Route path="closures" element={<ClosuresPage />} />
            <Route path="catalogue" element={<CataloguePage />} />
            <Route path="catalogue/compare" element={<ComparePage />} />
            <Route path="catalogue/:id" element={<DishDetailPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route
              path="users"
              element={
                <AdminRoute>
                  <UsersPage />
                </AdminRoute>
              }
            />
            <Route
              path="settings"
              element={
                <AdminRoute>
                  <SettingsPage />
                </AdminRoute>
              }
            />
            <Route
              path="public-page"
              element={
                <AdminRoute>
                  <PublicPagePage />
                </AdminRoute>
              }
            />
            <Route
              path="audit-logs"
              element={
                <AdminRoute>
                  <AuditLogsPage />
                </AdminRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route
            path="/org"
            element={
              <ProtectedRoute>
                <SupervisionRoute />
              </ProtectedRoute>
            }
          />
          <Route
            path="/org/:org"
            element={
              <ProtectedRoute>
                <OrgRoute>
                  <OrgLayout />
                </OrgRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<OrgOverviewPage />} />
            <Route path="analytics/traffic" element={<OrgTrafficPage />} />
            <Route path="analytics/satisfaction" element={<OrgSatisfactionPage />} />
            <Route path="analytics/publications" element={<OrgPublicationsPage />} />
            <Route path="sites" element={<OrgSitesPage />} />
            <Route path="sites/:site" element={<OrgSiteDetailPage />} />
            <Route path="catalog" element={<OrgCatalogPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="audit" element={<AuditLogsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </PwaInstallProvider>
  );
}

export default App;
