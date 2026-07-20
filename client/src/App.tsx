/**
 * MARIAM - Application principale
 *
 * Routes :
 * - / : Redirection vers /menu (public) ou /admin (si connecté)
 * - /menu : Affichage public du menu (TV/Mobile)
 * - /notifications : Configuration des notifications push (public)
 * - /login : Connexion admin
 * - /activate/:token : Activation de compte
 * - /admin/* : Interface d'administration (protégée)
 */
import { useState, useEffect, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from './contexts/AuthContext';
import { PwaInstallProvider } from './contexts/PwaInstallContext';
import { Login } from './pages/Login';
import { Activate } from './pages/Activate';
import { ResetPassword } from './pages/ResetPassword';
import { TenantLayout, PublicRoot, MonoMenu, SluggedMenu } from './pages/public/PublicRoutes';
import { ErrorBoundary, PublicErrorFallback } from './components/ErrorBoundary';
import { NotificationsPage } from './pages/public/NotificationsPage';
import { AdminLayout } from './components/AdminLayout';
import { UsersPage } from './pages/admin/UsersPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { AccountPage } from './pages/admin/AccountPage';
import { EventsPage } from './pages/admin/EventsPage';
import { ClosuresPage } from './pages/admin/ClosuresPage';
import { ServicePage } from './pages/admin/ServicePage';
import { InstallPage } from './pages/admin/InstallPage';
import { SetupTransferPage } from './pages/admin/SetupTransferPage';
import { CalendarPage } from './pages/admin/calendar/CalendarPage';
import { OrgLayout } from './pages/org/OrgLayout';
import { OrgDashboardPage } from './pages/org/OrgDashboardPage';
import { OrgSitesPage } from './pages/org/OrgSitesPage';
import { OrgSiteNewPage } from './pages/org/OrgSiteNewPage';
import { OrgSiteDetailPage } from './pages/org/OrgSiteDetailPage';
import { OrgUsersPage } from './pages/org/OrgUsersPage';
import { OrgAuditPage } from './pages/org/OrgAuditPage';

// Pages chargées à la demande
const EventEditPage = lazy(() =>
  import('./pages/admin/EventEditPage').then((m) => ({ default: m.EventEditPage }))
);
const CataloguePage = lazy(() =>
  import('./pages/admin/CataloguePage').then((m) => ({ default: m.CataloguePage }))
);
const DishDetailPage = lazy(() =>
  import('./pages/admin/catalogue/DishDetailPage').then((m) => ({ default: m.DishDetailPage }))
);

// Error pages
import { NotFound, Forbidden } from './pages/errors';

// Spinner plein écran (attente de l'état d'authentification)
function FullScreenSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
    </div>
  );
}

// Route protégée pour l'admin (authentification requise)
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Route admin-only (rôle admin requis)
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenSpinner />;
  }

  if (user?.role !== 'admin' && user?.role !== 'org_admin') {
    return <Forbidden />;
  }

  return <>{children}</>;
}

// Route éditeur (rôle admin ou editor requis)
function EditorRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenSpinner />;
  }

  if (user?.role !== 'admin' && user?.role !== 'editor' && user?.role !== 'org_admin') {
    return <Forbidden />;
  }

  return <>{children}</>;
}

// Route publique (redirige si déjà connecté)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <FullScreenSpinner />;
  }

  if (isAuthenticated) {
    return <Navigate to={user?.role === 'org_admin' ? '/org' : '/admin'} replace />;
  }

  return <>{children}</>;
}

// Route directeur d'organisation (rôle org_admin requis)
function OrgRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenSpinner />;
  }

  if (user?.role !== 'org_admin') {
    return <Forbidden />;
  }

  return <>{children}</>;
}

function ResponsiveToaster() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return <Toaster position={isMobile ? 'top-center' : 'bottom-right'} richColors closeButton />;
}

function App() {
  return (
    <PwaInstallProvider>
      <ResponsiveToaster />
      <Routes>
        {/* Affichage public tenant-aware (org résolue par le Host) */}
        <Route
          element={
            <ErrorBoundary fallback={<PublicErrorFallback />}>
              <TenantLayout />
            </ErrorBoundary>
          }
        >
          <Route path="/" element={<PublicRoot />} />
          <Route path="/menu" element={<MonoMenu />} />
          <Route path="/:restaurantSlug/menu" element={<SluggedMenu />} />
        </Route>

        {/* Notifications push (public) */}
        <Route path="/notifications" element={<NotificationsPage />} />

        {/* Authentification */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        {/* Activation de compte */}
        <Route path="/activate/:token" element={<Activate />} />

        {/* Réinitialisation de mot de passe */}
        <Route path="/reset-password/:token" element={<ResetPassword />} />

        {/* Onboarding installation PWA (admin/editor, affiché une seule fois) */}
        <Route
          path="/admin/install"
          element={
            <ProtectedRoute>
              <InstallPage />
            </ProtectedRoute>
          }
        />

        {/* Réception du transfert de session cross-device */}
        <Route path="/admin/setup" element={<SetupTransferPage />} />

        {/* Interface Directeur d'organisation (org_admin) */}
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
          <Route index element={<OrgDashboardPage />} />
          <Route path="sites" element={<OrgSitesPage />} />
          <Route path="sites/new" element={<OrgSiteNewPage />} />
          <Route path="sites/:id" element={<OrgSiteDetailPage />} />
          <Route path="users" element={<OrgUsersPage />} />
          <Route path="audit" element={<OrgAuditPage />} />
        </Route>

        {/* Interface Admin */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard = Calendrier unifié (admin ou editor) */}
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

          {/* Anciennes routes — redirigent vers le calendrier */}
          <Route path="menus" element={<Navigate to="/admin/calendar" replace />} />

          {/* Mon compte (tous les utilisateurs authentifiés) */}
          <Route path="account" element={<AccountPage />} />

          {/* Service en cours (admin ou editor) */}
          <Route
            path="service"
            element={
              <EditorRoute>
                <ServicePage />
              </EditorRoute>
            }
          />

          {/* Événements (admin ou editor) */}
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

          {/* Fermetures exceptionnelles (admin ou editor) */}
          <Route
            path="closures"
            element={
              <EditorRoute>
                <ClosuresPage />
              </EditorRoute>
            }
          />

          {/* Catalogue de plats (admin ou editor) */}
          <Route
            path="catalogue"
            element={
              <EditorRoute>
                <CataloguePage />
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

          {/* Gestion des utilisateurs (admin only) */}
          <Route
            path="users"
            element={
              <AdminRoute>
                <UsersPage />
              </AdminRoute>
            }
          />

          {/* Paramètres du restaurant (admin only) */}
          <Route
            path="settings"
            element={
              <AdminRoute>
                <SettingsPage />
              </AdminRoute>
            }
          />

          {/* Logs d'audit (admin only) */}
          <Route
            path="audit-logs"
            element={
              <AdminRoute>
                <AuditLogsPage />
              </AdminRoute>
            }
          />
        </Route>

        {/* 404 Catch-all - Doit être en dernier */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </PwaInstallProvider>
  );
}

export default App;
