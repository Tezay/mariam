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
import { CalendarDays, ChefHat, BookOpen, Users, Settings, Shield, X } from 'lucide-react';

// Fallback affiché dans la zone de contenu pendant le téléchargement
// d'un chunk lazy (pages admin lourdes) — la sidebar reste visible,
// puis le skeleton de données propre à chaque page prend le relais.
function ContentSkeleton() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-3">
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
    publicApi
      .getRestaurant()
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
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
  ) : undefined;

  const navItems: SidebarNavItem[] = [
    {
      to: '/admin/calendar',
      label: 'Calendrier',
      icon: <CalendarDays className="h-5 w-5" />,
    },
    {
      to: '/admin/service',
      label: 'Service en cours',
      icon: <ChefHat className="h-5 w-5" />,
      badge: servicePulse,
    },
    {
      to: '/admin/catalogue',
      label: 'Catalogue',
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      to: '/admin/users',
      label: 'Utilisateurs',
      icon: <Users className="h-5 w-5" />,
    },
    {
      to: '/admin/settings',
      label: 'Paramètres',
      icon: <Settings className="h-5 w-5" />,
    },
    {
      to: '/admin/audit-logs',
      label: "Logs d'audit",
      icon: <Shield className="h-5 w-5" />,
    },
  ];

  const filteredNavItems = navItems.filter((item) => {
    const adminOnly = ['/admin/users', '/admin/settings', '/admin/audit-logs'].includes(item.to);
    return !adminOnly || user?.role === 'admin';
  });

  // Bottom nav: pinned 4 routes (calendar, service, catalogue, settings)
  const bottomNavItems = filteredNavItems.filter((item) =>
    ['/admin/calendar', '/admin/service', '/admin/catalogue', '/admin/settings'].includes(item.to)
  );

  return (
    <>
      {/* ── Main shell ─────────────────────────────────────────────── */}
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <Sidebar navItems={filteredNavItems} />

        {/* Content area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
              className="fixed inset-0 z-40 bg-black/50 sidebar:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card sidebar:hidden"
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: 'tween', duration: 0.2, ease: 'easeInOut' }}
            >
              {/* Mobile sidebar header — grand logo aligné à gauche */}
              <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
                <Logo className="h-8 w-auto" />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Mobile nav */}
              <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
                {filteredNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                        isActive
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
            className="fixed bottom-4 left-1/2 z-30 flex items-center gap-1 rounded-full border border-border/50 bg-background/95 px-2 py-2 shadow-lg shadow-black/5 backdrop-blur-md sidebar:hidden"
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
                    'flex min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1.5 text-[10px] leading-tight transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )
                }
              >
                <span className="relative">
                  {item.icon}
                  {item.badge && <span className="absolute -right-0.5 -top-0.5">{item.badge}</span>}
                </span>
                <span className="max-w-[56px] truncate text-center">
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
