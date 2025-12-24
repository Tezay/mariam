/**
 * MARIAM - Layout Admin avec sidebar
 */
import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
    CalendarDays,
    Megaphone,
    Users,
    Settings,
    Menu as MenuIcon,
    X,
    LogOut,
    ExternalLink,
    Shield
} from 'lucide-react';

interface NavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
}

export function AdminLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const navItems: NavItem[] = [
        { to: '/admin/menus', label: 'Menus', icon: <CalendarDays className="w-5 h-5" /> },
        { to: '/admin/events', label: 'Événements', icon: <Megaphone className="w-5 h-5" /> },
        { to: '/admin/users', label: 'Utilisateurs', icon: <Users className="w-5 h-5" />, adminOnly: true },
        { to: '/admin/settings', label: 'Paramètres', icon: <Settings className="w-5 h-5" />, adminOnly: true },
        { to: '/admin/audit-logs', label: 'Logs d\'audit', icon: <Shield className="w-5 h-5" />, adminOnly: true },
    ];

    const filteredNavItems = navItems.filter(item => !item.adminOnly || user?.role === 'admin');

    const closeSidebar = () => setSidebarOpen(false);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b sticky top-0 z-40">
                <div className="container-mariam flex items-center justify-between h-16">
                    {/* Menu hamburger (mobile) + Logo */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="md:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900"
                            aria-label="Ouvrir le menu"
                        >
                            <MenuIcon className="w-6 h-6" />
                        </button>
                        <NavLink to="/admin" className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-mariam-blue">MARIAM</span>
                            <span className="text-sm text-gray-400 hidden sm:inline">Admin</span>
                        </NavLink>
                    </div>

                    {/* Menu utilisateur */}
                    <div className="flex items-center gap-4">
                        <NavLink
                            to="/menu"
                            target="_blank"
                            className="text-sm text-gray-500 hover:text-mariam-blue hidden sm:flex items-center gap-1"
                        >
                            Voir le menu public
                            <ExternalLink className="w-3 h-3" />
                        </NavLink>

                        <div className="flex items-center gap-3">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-medium text-gray-900">
                                    {user?.username || user?.email}
                                </p>
                                <p className="text-xs text-gray-500 capitalize">
                                    {user?.role}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleLogout}
                                className="gap-2"
                            >
                                <LogOut className="w-4 h-4" />
                                <span className="hidden sm:inline">Déconnexion</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Layout principal */}
            <div className="flex">
                {/* Overlay mobile */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-30 md:hidden"
                        onClick={closeSidebar}
                    />
                )}

                {/* Sidebar */}
                <aside className={`
                    fixed md:static inset-y-0 left-0 z-30
                    w-64 bg-white border-r
                    transform transition-transform duration-200 ease-in-out
                    md:transform-none md:transition-none
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                    min-h-[calc(100vh-4rem)] md:min-h-[calc(100vh-4rem)]
                    pt-16 md:pt-0
                `}>
                    {/* Bouton fermer (mobile) */}
                    <button
                        onClick={closeSidebar}
                        className="md:hidden absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700"
                        aria-label="Fermer le menu"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <nav className="p-4 space-y-1">
                        {filteredNavItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={closeSidebar}
                                className={({ isActive }) => `
                                    flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                                    ${isActive
                                        ? 'bg-blue-50 text-mariam-blue font-medium'
                                        : 'text-gray-600 hover:bg-gray-50'
                                    }
                                `}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </nav>
                </aside>

                {/* Contenu principal */}
                <main className="flex-1 pb-20 md:pb-0">
                    <Outlet />
                </main>
            </div>

            {/* Nav mobile (bottom) */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex z-30">
                {filteredNavItems.slice(0, 4).map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => `
                            flex-1 flex flex-col items-center py-3 text-xs
                            ${isActive ? 'text-mariam-blue' : 'text-gray-500'}
                        `}
                    >
                        {item.icon}
                        <span className="mt-1">{item.label}</span>
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
