import { useState, useEffect, Suspense } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { publicApi, ServiceHours } from '@/lib/api';
import { isInServiceHours } from '@/lib/utils';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import { Sidebar, type SidebarNavItem } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
    CalendarDays,
    ChefHat,
    BookOpen,
    Users,
    Settings,
    Shield,
    X,
} from 'lucide-react';

// Fallback affiché dans la zone de contenu pendant le téléchargement
// d'un chunk lazy (pages admin lourdes) — la sidebar reste visible,
// puis le skeleton de données propre à chaque page prend le relais.
function ContentSkeleton() {
    return (
        <div className="p-4 sm:p-6 space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
            </div>
        </div>
    );
}

// ─── Layout inner (needs SidebarProvider above) ───────────────────────────────

function AdminLayoutContent() {
    const { user } = useAuth();
    const { isMobileOpen, setMobileOpen, immersive } = useSidebar();
    const navigate = useNavigate();
    const location = useLocation();
    const [serviceHours, setServiceHours] = useState<ServiceHours>({});
    const [duringService, setDuringService] = useState(false);

    // Identify in Umami by role — intentionally re-runs on id change only
    useEffect(() => {
        if (user?.role) window.umami?.identify({ role: user.role });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    // Redirect to PWA onboarding on first login
    useEffect(() => {
        const isAdminOrEditor = user?.role === 'admin' || user?.role === 'editor';
        const alreadyShown = !!localStorage.getItem('mariam-pwa-install-done');
        const isPwa =
            window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as unknown as { standalone?: boolean }).standalone === true;

        if (
            isAdminOrEditor &&
            !alreadyShown &&
            !isPwa &&
            location.pathname !== '/admin/install' &&
            location.pathname !== '/admin/setup'
        ) {
            window.location.replace('/admin/install');
        }
    }, [user, location.pathname, navigate]);

    useEffect(() => {
        publicApi.getRestaurant()
            .then((r) => setServiceHours(r?.config?.service_hours ?? {}))
            .catch(() => {});
    }, []);

    useEffect(() => {
        const check = () => setDuringService(isInServiceHours(serviceHours));
        check();
        const id = setInterval(check, 60_000);
        return () => clearInterval(id);
    }, [serviceHours]);

    const servicePulse = duringService ? (
        <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
    ) : undefined;

    const navItems: SidebarNavItem[] = [
        {
            to: '/admin/calendar',
            label: 'Calendrier',
            icon: <CalendarDays className="w-5 h-5" />,
        },
        {
            to: '/admin/service',
            label: 'Service en cours',
            icon: <ChefHat className="w-5 h-5" />,
            badge: servicePulse,
        },
        {
            to: '/admin/catalogue',
            label: 'Catalogue',
            icon: <BookOpen className="w-5 h-5" />,
        },
        {
            to: '/admin/users',
            label: 'Utilisateurs',
            icon: <Users className="w-5 h-5" />,
        },
        {
            to: '/admin/settings',
            label: 'Paramètres',
            icon: <Settings className="w-5 h-5" />,
        },
        {
            to: '/admin/audit-logs',
            label: "Logs d'audit",
            icon: <Shield className="w-5 h-5" />,
        },
    ];

    const filteredNavItems = navItems.filter((item) => {
        const adminOnly = ['/admin/users', '/admin/settings', '/admin/audit-logs'].includes(item.to);
        return !adminOnly || user?.role === 'admin';
    });

    // Bottom nav: pinned 4 routes (calendar, service, catalogue, settings)
    const bottomNavItems = filteredNavItems.filter(item =>
        ['/admin/calendar', '/admin/service', '/admin/catalogue', '/admin/settings'].includes(item.to)
    );

    return (
        <>
            {/* ── Main shell ─────────────────────────────────────────────── */}
            <div className="flex h-screen overflow-hidden bg-background">
                {/* Desktop sidebar */}
                <Sidebar navItems={filteredNavItems} />

                {/* Content area */}
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                    <Topbar />
                    <main className={cn('flex-1 overflow-auto', immersive ? 'pb-0' : 'pb-24 sidebar:pb-0')}>
                        <Suspense fallback={<ContentSkeleton />}>
                            <Outlet />
                        </Suspense>
                    </main>
                </div>
            </div>

            {/* ── Mobile sidebar overlay ─────────────────────────────────── */}
            <AnimatePresence>
                {isMobileOpen && (
                    <>
                        <motion.div
                            className="fixed inset-0 bg-black/50 z-40 sidebar:hidden"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            onClick={() => setMobileOpen(false)}
                        />
                        <motion.aside
                            className="fixed inset-y-0 left-0 w-72 bg-card border-r border-border z-50 flex flex-col sidebar:hidden"
                            initial={{ x: -288 }}
                            animate={{ x: 0 }}
                            exit={{ x: -288 }}
                            transition={{ type: 'tween', duration: 0.2, ease: 'easeInOut' }}
                        >
                            {/* Mobile sidebar header — grand logo aligné à gauche */}
                            <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
                                <Logo className="h-8 w-auto" />
                                <button
                                    onClick={() => setMobileOpen(false)}
                                    className="ml-auto p-1.5 text-muted-foreground hover:text-foreground rounded-md transition-colors"
                                    aria-label="Fermer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Mobile nav */}
                            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
                                {filteredNavItems.map((item) => (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        onClick={() => setMobileOpen(false)}
                                        className={({ isActive }) =>
                                            cn(
                                                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                                                isActive
                                                    ? 'bg-primary/10 text-primary font-medium'
                                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                            )
                                        }
                                    >
                                        <span className="shrink-0">{item.icon}</span>
                                        <span className="flex-1 truncate">{item.label}</span>
                                        {item.badge}
                                    </NavLink>
                                ))}
                            </nav>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* ── Mobile bottom nav (floating pill) — masquée en mode immersif ── */}
            <AnimatePresence>
                {!immersive && (
                    <motion.nav
                        className="sidebar:hidden fixed bottom-4 left-1/2 z-30 flex items-center gap-1 px-2 py-2 bg-background/95 backdrop-blur-md border border-border/50 shadow-lg shadow-black/5 rounded-full"
                        // framer-motion pilote le transform : le centrage -translate-x-1/2
                        // doit passer par `x`, pas par une classe Tailwind (sinon écrasé)
                        initial={{ opacity: 0, y: 12, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: 12, x: '-50%' }}
                        transition={{ duration: 0.2 }}
                    >
                        {bottomNavItems.map((item) => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    cn(
                                        'flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-full text-[10px] leading-tight transition-colors min-w-[52px]',
                                        isActive
                                            ? 'text-primary bg-primary/10'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                                    )
                                }
                            >
                                <span className="relative">
                                    {item.icon}
                                    {item.badge && (
                                        <span className="absolute -top-0.5 -right-0.5">{item.badge}</span>
                                    )}
                                </span>
                                <span className="truncate max-w-[56px] text-center">
                                    {item.label === 'Service en cours' ? 'Service' : item.label}
                                </span>
                            </NavLink>
                        ))}
                    </motion.nav>
                )}
            </AnimatePresence>
        </>
    );
}

// ─── Public export ────────────────────────────────────────────────────────────

export function AdminLayout() {
    return (
        <SidebarProvider>
            <AdminLayoutContent />
        </SidebarProvider>
    );
}
