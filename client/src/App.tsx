import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { Toaster } from 'sonner';
import { useAuth } from './contexts/AuthContext';
import { PwaInstallProvider } from './contexts/PwaInstallContext';
import { SiteProvider } from './contexts/SiteContext';
import { useTheme } from './contexts/ThemeProvider';
import { PageLoader } from './components/PageLoader';
import { dashboardPathForRole } from './lib/dashboard-routes';

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
const EventsPage = lazy(() =>
  import('./pages/admin/EventsPage').then((m) => ({ default: m.EventsPage }))
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
const EventEditPage = lazy(() =>
  import('./pages/admin/EventEditPage').then((m) => ({ default: m.EventEditPage }))
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
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (user?.role !== 'admin') {
    return <Forbidden />;
  }

  return <>{children}</>;
}

// A supervisor is sent to their own dashboard.
function SiteDashboardRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (user?.role === 'org_admin') {
    return <Navigate to="/org" replace />;
  }

  const org = user?.organization?.slug;
  const site = user?.site?.slug;
  if (!org || !site) {
    return <NotFound />;
  }
  return <SiteProvider site={{ org, site }}>{children}</SiteProvider>;
}

function EditorRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (user?.role !== 'admin' && user?.role !== 'editor') {
    return <Forbidden />;
  }

  return <>{children}</>;
}

// Sends a signed-in user to the dashboard.
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (isAuthenticated) {
    return <Navigate to={dashboardPathForRole(user?.role)} replace />;
  }

  return <>{children}</>;
}

function OrgRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (user?.role !== 'org_admin') {
    return <Forbidden />;
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

          <Route
            path="/admin/security"
            element={
              <ProtectedRoute>
                <SecurityPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/org/security"
            element={
              <ProtectedRoute>
                <SecurityPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/install"
            element={
              <ProtectedRoute>
                <InstallPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/org/install"
            element={
              <ProtectedRoute>
                <InstallPage />
              </ProtectedRoute>
            }
          />

          <Route path="/admin/setup" element={<SetupTransferPage />} />

          <Route
            path="/org"
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
            <Route path="catalog" element={<OrgCatalogPage />} />
            <Route path="sites/:site" element={<OrgSiteDetailPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="audit" element={<AuditLogsPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <SiteDashboardRoute>
                  <AdminLayout />
                </SiteDashboardRoute>
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <EditorRoute>
                  <CalendarPage />
                </EditorRoute>
              }
            />
            <Route
              path="calendar"
              element={
                <EditorRoute>
                  <CalendarPage />
                </EditorRoute>
              }
            />

            {/* Former addresses, kept for bookmarks */}
            <Route path="menus" element={<Navigate to="/admin/calendar" replace />} />

            <Route path="account" element={<AccountPage />} />

            <Route
              path="service"
              element={
                <EditorRoute>
                  <ServicePage />
                </EditorRoute>
              }
            />

            <Route
              path="events"
              element={
                <EditorRoute>
                  <EventsPage />
                </EditorRoute>
              }
            />
            <Route
              path="events/new"
              element={
                <EditorRoute>
                  <EventEditPage />
                </EditorRoute>
              }
            />
            <Route
              path="events/:id/edit"
              element={
                <EditorRoute>
                  <EventEditPage />
                </EditorRoute>
              }
            />

            <Route
              path="closures"
              element={
                <EditorRoute>
                  <ClosuresPage />
                </EditorRoute>
              }
            />

            <Route
              path="catalogue"
              element={
                <EditorRoute>
                  <CataloguePage />
                </EditorRoute>
              }
            />
            <Route
              path="catalogue/compare"
              element={
                <EditorRoute>
                  <ComparePage />
                </EditorRoute>
              }
            />
            <Route
              path="catalogue/:id"
              element={
                <EditorRoute>
                  <DishDetailPage />
                </EditorRoute>
              }
            />

            <Route
              path="stats"
              element={
                <AdminRoute>
                  <StatsPage />
                </AdminRoute>
              }
            />

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
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </PwaInstallProvider>
  );
}

export default App;
