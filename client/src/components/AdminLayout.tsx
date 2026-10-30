import { useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSiteRef } from '@/contexts/SiteContext';
import { sitesApi, type ServiceHours } from '@/lib/api/sites';
import { isInServiceHours } from '@/lib/utils';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { type SidebarNavItem } from '@/components/layout/Sidebar';
import { type PageTitleMap } from '@/components/layout/Topbar';
import { usePwaOnboarding } from '@/hooks/usePwaOnboarding';
import { useSecurityOnboarding } from '@/hooks/useSecurityOnboarding';
import { TourHost } from '@/features/tour/TourHost';
import {
  CalendarDays,
  ChartColumn,
  ChefHat,
  BookOpen,
  Users,
  Settings,
  Shield,
  Globe,
} from 'lucide-react';

const PAGE_TITLES: PageTitleMap = [
  ['/admin/calendar', 'Calendrier'],
  ['/admin/service', 'Service en cours'],
  ['/admin/catalogue', 'Catalogue'],
  ['/admin/events', 'Événements'],
  ['/admin/closures', 'Fermetures'],
  ['/admin/stats', 'Statistiques'],
  ['/admin/users', 'Utilisateurs'],
  ['/admin/settings', 'Mon restaurant'],
  ['/admin/public-page', 'Page publique'],
  ['/admin/audit-logs', "Logs d'audit"],
  ['/admin/account', 'Mon compte'],
  ['/admin', 'Calendrier'],
];

const BOTTOM_NAV_PATHS = ['/admin/calendar', '/admin/service', '/admin/catalogue', '/admin/stats'];

const ADMIN_ONLY_PATHS = [
  '/admin/users',
  '/admin/settings',
  '/admin/public-page',
  '/admin/audit-logs',
];

export function AdminLayout() {
  const { user } = useAuth();
  const site = useSiteRef();
  const { pathname } = useLocation();
  const [serviceHours, setServiceHours] = useState<ServiceHours>({});
  const [duringService, setDuringService] = useState(false);

  useSecurityOnboarding(user, '/admin/security');
  usePwaOnboarding('/admin/install');

  // Identify in Umami by role — intentionally re-runs on id change only
  useEffect(() => {
    if (user?.role) window.umami?.identify({ role: user.role });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    sitesApi
      .getOwn(site)
      .then((own) => setServiceHours(own.service_hours))
      .catch(() => {});
  }, [site]);

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
    { to: '/admin/calendar', label: 'Calendrier', icon: <CalendarDays className="h-5 w-5" /> },
    {
      to: '/admin/service',
      label: 'Service en cours',
      shortLabel: 'Service',
      icon: <ChefHat className="h-5 w-5" />,
      badge: servicePulse,
    },
    { to: '/admin/catalogue', label: 'Catalogue', icon: <BookOpen className="h-5 w-5" /> },
    {
      to: '/admin/stats',
      label: 'Statistiques',
      shortLabel: 'Stats',
      icon: <ChartColumn className="h-5 w-5" />,
    },
    { to: '/admin/users', label: 'Utilisateurs', icon: <Users className="h-5 w-5" /> },
    {
      to: '/admin/settings',
      label: 'Mon restaurant',
      shortLabel: 'Restaurant',
      icon: <Settings className="h-5 w-5" />,
    },
    {
      to: '/admin/public-page',
      label: 'Page publique',
      shortLabel: 'Page',
      icon: <Globe className="h-5 w-5" />,
    },
    { to: '/admin/audit-logs', label: "Logs d'audit", icon: <Shield className="h-5 w-5" /> },
  ];

  const filteredNavItems = navItems.filter(
    (item) => !ADMIN_ONLY_PATHS.includes(item.to) || user?.role === 'admin'
  );

  // One of its steps points at the calendar's own toolbar.
  const onCalendar = pathname === '/admin' || pathname.startsWith('/admin/calendar');

  return (
    <>
      <DashboardShell
        navItems={filteredNavItems}
        homePath="/admin"
        bottomNavPaths={BOTTOM_NAV_PATHS}
        pageTitles={PAGE_TITLES}
        fallbackTitle="Admin"
        showSearch
        showNotifications
        accountPath="/admin/account"
        tenant={user?.site ? { label: 'Site', name: user.site.name } : undefined}
      />
      <TourHost tour="orientation" enabled={onCalendar} canSeeStats={user?.role === 'admin'} />
    </>
  );
}
