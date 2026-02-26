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
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { Activate } from './pages/Activate';
import { ResetPassword } from './pages/ResetPassword';
import { MenuDisplay } from './pages/public/MenuDisplay';
import { NotificationsPage } from './pages/public/NotificationsPage';
import { AdminLayout } from './components/AdminLayout';
import { WeeklyPlanner } from './pages/admin/WeeklyPlanner';
import { UsersPage } from './pages/admin/UsersPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';
import { AccountPage } from './pages/admin/AccountPage';
import { EventsPage } from './pages/admin/EventsPage';
import { GalleryPage } from './pages/admin/GalleryPage';

// Error pages
import { NotFound, Forbidden } from './pages/errors';

// Route protégée pour l'admin (authentification requise)
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
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
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (user?.role !== 'admin') {
        return <Forbidden />;
    }

    return <>{children}</>;
}

// Route publique (redirige si déjà connecté)
function PublicRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (isAuthenticated) {
        return <Navigate to="/admin" replace />;
    }

    return <>{children}</>;
}

function App() {
    return (
        <Routes>
            {/* Page d'accueil - Affiche le menu public */}
            <Route path="/" element={<Navigate to="/menu" replace />} />

            {/* Menu public (TV/Mobile) */}
            <Route path="/menu" element={<MenuDisplay />} />

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

            {/* Interface Admin */}
            <Route
                path="/admin"
                element={
                    <ProtectedRoute>
                        <AdminLayout />
                    </ProtectedRoute>
                }
            >
                {/* Dashboard = Weekly Planner (tous les utilisateurs authentifiés) */}
                <Route index element={<WeeklyPlanner />} />
                <Route path="menus" element={<WeeklyPlanner />} />

                {/* Mon compte (tous les utilisateurs authentifiés) */}
                <Route path="account" element={<AccountPage />} />

                {/* Événements (tous les utilisateurs authentifiés) */}
                <Route path="events" element={<EventsPage />} />

                {/* Galerie photos (tous les utilisateurs authentifiés) */}
                <Route path="gallery" element={<GalleryPage />} />

                {/* Gestion des utilisateurs (admin only) */}
                <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />

                {/* Paramètres du restaurant (admin only) */}
                <Route path="settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />

                {/* Logs d'audit (admin only) */}
                <Route path="audit-logs" element={<AdminRoute><AuditLogsPage /></AdminRoute>} />
            </Route>

            {/* 404 Catch-all - Doit être en dernier */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}


export default App;
