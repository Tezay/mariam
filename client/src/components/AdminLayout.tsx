import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { restaurantApi, ServiceHours } from '@/lib/api';
import { isInServiceHours } from '@/lib/utils';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { type SidebarNavItem } from '@/components/layout/Sidebar';
import { type PageTitleMap } from '@/components/layout/Topbar';
import { usePwaOnboarding } from '@/hooks/usePwaOnboarding';
import {
  CalendarDays,
  ChartColumn,
  ChefHat,
  BookOpen,
  Users,
  Settings,
  Shield,
} from 'lucide-react';

const PAGE_TITLES: PageTitleMap = [
  ['/admin/calendar', 'Calendrier'],
  ['/admin/service', 'Service en cours'],
  ['/admin/catalogue', 'Catalogue'],
  ['/admin/events', 'Événements'],
  ['/admin/closures', 'Fermetures'],
  ['/admin/stats', 'Statistiques'],
  ['/admin/users', 'Utilisateurs'],
  ['/admin/settings', 'Paramètres'],
  ['/admin/audit-logs', "Logs d'audit"],
  ['/admin/account', 'Mon compte'],
  ['/admin', 'Calendrier'],
];

const BOTTOM_NAV_PATHS = [
  '/admin/calendar',
  '/admin/service',
  '/admin/catalogue',
  '/admin/settings',
];

const ADMIN_ONLY_PATHS = ['/admin/stats', '/admin/users', '/admin/settings', '/admin/audit-logs'];

export function AdminLayout() {
  const { user } = useAuth();
  const [serviceHours, setServiceHours] = useState<ServiceHours>({});
  const [duringService, setDuringService] = useState(false);

  usePwaOnboarding('/admin/install', user?.role === 'admin' || user?.role === 'editor');

  // Identify in Umami by role — intentionally re-runs on id change only
  useEffect(() => {
    if (user?.role) window.umami?.identify({ role: user.role });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    restaurantApi
      .getMine()
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
    { to: '/admin/calendar', label: 'Calendrier', icon: <CalendarDays className="h-5 w-5" /> },
    {
      to: '/admin/service',
      label: 'Service en cours',
      shortLabel: 'Service',
      icon: <ChefHat className="h-5 w-5" />,
      badge: servicePulse,
    },
    { to: '/admin/catalogue', label: 'Catalogue', icon: <BookOpen className="h-5 w-5" /> },
    { to: '/admin/stats', label: 'Statistiques', icon: <ChartColumn className="h-5 w-5" /> },
    { to: '/admin/users', label: 'Utilisateurs', icon: <Users className="h-5 w-5" /> },
    { to: '/admin/settings', label: 'Paramètres', icon: <Settings className="h-5 w-5" /> },
    { to: '/admin/audit-logs', label: "Logs d'audit", icon: <Shield className="h-5 w-5" /> },
  ];

  const filteredNavItems = navItems.filter(
    (item) => !ADMIN_ONLY_PATHS.includes(item.to) || user?.role === 'admin'
  );

  return (
    <DashboardShell
      navItems={filteredNavItems}
      homePath="/admin"
      bottomNavPaths={BOTTOM_NAV_PATHS}
      pageTitles={PAGE_TITLES}
      fallbackTitle="Admin"
      showSearch
      showNotifications
      accountPath="/admin/account"
      tenant={user?.restaurant_name ? { label: 'Site', name: user.restaurant_name } : undefined}
    />
  );
}
