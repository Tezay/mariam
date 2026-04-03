/**
 * MARIAM - Layout Admin avec sidebar
 */
import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { eventsApi, publicApi, ServiceHours } from '@/lib/api';
import { isInServiceHours } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    CalendarDays,
    ChefHat,
    Megaphone,
    Image as ImageIcon,
    Users,
    Settings,
    Menu as MenuIcon,
    X,
    LogOut,
    ExternalLink,
    Shield,
    User,
    Moon,
    Sun,
    ChevronDown,
    HelpCircle
} from 'lucide-react';

interface NavItem {
    to: string;
    label: string;
    mobileLabel?: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
    badge?: React.ReactNode;
    highlight?: 'amber';
}

export function AdminLayout() {
    const { user, logout } = useAuth();
    const { theme, setTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [hasTodayEvent, setHasTodayEvent] = useState(false);
    const [serviceHours, setServiceHours] = useState<ServiceHours>({});
    const [duringService, setDuringService] = useState(false);

    // Identify authenticated user in Umami by role
    useEffect(() => {
        if (user?.role) window.umami?.identify({ role: user.role });
    }, [user?.id]);

    // Redirect admin/editor to the PWA install onboarding on first login
    useEffect(() => {
        const isAdminOrEditor = user?.role === 'admin' || user?.role === 'editor';
        const alreadyShown = !!localStorage.getItem('mariam_pwa_install_done');
        const isPwa = window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as unknown as { standalone?: boolean }).standalone === true;

        if (isAdminOrEditor && !alreadyShown && !isPwa &&
            location.pathname !== '/admin/install' &&
            location.pathname !== '/admin/setup') {
            window.location.replace('/admin/install');
        }
    }, [user, location.pathname, navigate]);

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        eventsApi.list(true)
            .then(events => {
                setHasTodayEvent(events.some(
                    e => e.event_date === today && e.status === 'published'
                ));
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        publicApi.getRestaurant()
            .then(r => setServiceHours(r?.config?.service_hours ?? {}))
            .catch(() => {});
    }, []);

    useEffect(() => {
        const check = () => setDuringService(isInServiceHours(serviceHours));
        check();
        const id = setInterval(check, 60_000);
        return () => clearInterval(id);
    }, [serviceHours]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const todayDot = hasTodayEvent ? (
        <span className="relative flex h-2 w-2 ml-auto">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
    ) : undefined;

    const servicePulse = duringService ? (
        <span className="relative flex h-2 w-2 ml-auto">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
    ) : undefined;

    const navItems: NavItem[] = [
        { to: '/admin/menus', label: 'Menus', icon: <CalendarDays className="w-5 h-5" /> },
        { to: '/admin/service', label: 'Service en cours', mobileLabel: 'Service', icon: <ChefHat className="w-5 h-5" />, badge: servicePulse, highlight: 'amber' },
        { to: '/admin/events', label: 'Événements', icon: <Megaphone className="w-5 h-5" />, badge: todayDot },
        { to: '/admin/gallery', label: 'Galerie', icon: <ImageIcon className="w-5 h-5" /> },
        { to: '/admin/users', label: 'Utilisateurs', icon: <Users className="w-5 h-5" />, adminOnly: true },
        { to: '/admin/settings', label: 'Paramètres', icon: <Settings className="w-5 h-5" />, adminOnly: true },
        { to: '/admin/audit-logs', label: 'Logs d\'audit', icon: <Shield className="w-5 h-5" />, adminOnly: true },
    ];

    const filteredNavItems = navItems.filter(item => !item.adminOnly || user?.role === 'admin');

    const closeSidebar = () => setSidebarOpen(false);

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="bg-card border-b border-border sticky top-0 z-40">
                <div className="container-mariam flex items-center justify-between h-16">
                    {/* Menu hamburger (mobile) + Logo */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
                            aria-label="Ouvrir le menu"
                        >
                            <MenuIcon className="w-6 h-6" />
                        </button>
                        <NavLink to="/admin" className="flex items-center gap-2">
                            <Logo className="h-16 w-auto p-2" />
                            <span className="text-sm text-muted-foreground hidden sm:inline">Gestion</span>
                        </NavLink>
                    </div>

                    {/* Menu utilisateur */}
                    <div className="flex items-center gap-4">
                        <NavLink
                            to="/menu"
                            target="_blank"
                            className="text-sm text-muted-foreground hover:text-mariam-blue hidden sm:flex items-center gap-1"
                        >
                            Voir le menu public
                            <ExternalLink className="w-3 h-3" />
                        </NavLink>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="gap-2">
                                    <User className="w-4 h-4" />
                                    <span className="hidden sm:inline max-w-32 truncate">
                                        {user?.username || user?.email}
                                    </span>
                                    <ChevronDown className="w-3 h-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>
                                    <div>
                                        <p className="font-medium">{user?.username || user?.email}</p>
                                        <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                    <NavLink to="/admin/account" className="cursor-pointer">
                                        <User className="w-4 h-4 mr-2" />
                                        Mon compte
                                    </NavLink>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                                    {theme === 'dark'
                                        ? <Sun className="w-4 h-4 mr-2" />
                                        : <Moon className="w-4 h-4 mr-2" />
                                    }
                                    Thème sombre
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                                    <LogOut className="w-4 h-4 mr-2" />
                                    Se déconnecter
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
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
                    fixed inset-y-0 left-0 z-30
                    w-64 bg-card border-r border-border
                    transform transition-transform duration-200 ease-in-out
                    md:transform-none md:transition-none
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                    md:top-16
                    pt-16 md:pt-0
                `}>
                    {/* Bouton fermer (mobile) */}
                    <button
                        onClick={closeSidebar}
                        className="md:hidden absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground"
                        aria-label="Fermer le menu"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex flex-col justify-between h-[calc(100vh-4rem)] pb-16 md:pb-0">
                        <nav className="p-4 space-y-1">
                            {filteredNavItems.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    onClick={closeSidebar}
                                    className={({ isActive }) => {
                                        if (!isActive) return 'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-muted-foreground hover:bg-muted';
                                        if (item.highlight === 'amber' && duringService) return 'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium';
                                        return 'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors bg-primary/10 text-primary font-medium';
                                    }}
                                >
                                    {item.icon}
                                    <span>{item.label}</span>
                                    {item.badge}
                                </NavLink>
                            ))}
                        </nav>

                        <div className="p-4 border-t border-border">
                            <a
                                href="https://mariam.app/docs/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                            >
                                <HelpCircle className="w-5 h-5" />
                                <span>Besoin d'aide ?</span>
                                <ExternalLink className="w-4 h-4 ml-auto" />
                            </a>
                        </div>
                    </div>
                </aside>

                {/* Contenu principal */}
                <main className="flex-1 min-w-0 overflow-x-hidden pb-20 md:pb-0 md:ml-64">
                    <Outlet />
                </main>
            </div>

            {/* Nav mobile (bottom) */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex z-30">
                {filteredNavItems.slice(0, 4).map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => {
                            if (!isActive) return 'flex-1 flex flex-col items-center py-3 text-xs text-muted-foreground';
                            if (item.highlight === 'amber' && duringService) return 'flex-1 flex flex-col items-center py-3 text-xs text-amber-600 dark:text-amber-400';
                            return 'flex-1 flex flex-col items-center py-3 text-xs text-primary';
                        }}
                    >
                        <span className="relative">
                            {item.icon}
                            {item.badge && (
                                <span className="absolute -top-0.5 -right-0.5">{item.badge}</span>
                            )}
                        </span>
                        <span className="mt-1">{item.mobileLabel ?? item.label}</span>
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
