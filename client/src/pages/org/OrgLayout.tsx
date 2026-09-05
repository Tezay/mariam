/**
 * Director dashboard (org_admin): a cross-site view of the organization.
 * Shares its shell with the site dashboard so both stay visually identical;
 * only the navigation and the enabled top-bar features differ.
 */
import {
  LayoutDashboard,
  Building2,
  CalendarCheck,
  TrendingUp,
  Users,
  ScrollText,
} from 'lucide-react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { type SidebarNavItem } from '@/components/layout/Sidebar';
import { type PageTitleMap } from '@/components/layout/Topbar';
import { useAuth } from '@/contexts/AuthContext';
import { usePwaOnboarding } from '@/hooks/usePwaOnboarding';

const NAV_ITEMS: SidebarNavItem[] = [
  {
    to: '/org',
    label: "Vue d'ensemble",
    shortLabel: 'Résumé',
    icon: <LayoutDashboard className="h-5 w-5" />,
    end: true,
  },
  {
    to: '/org/analytics/traffic',
    label: 'Consultations du menu',
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    to: '/org/analytics/publications',
    label: 'Publications',
    icon: <CalendarCheck className="h-5 w-5" />,
  },
  { to: '/org/sites', label: 'Sites', icon: <Building2 className="h-5 w-5" /> },
  { to: '/org/users', label: 'Utilisateurs', icon: <Users className="h-5 w-5" /> },
  { to: '/org/audit', label: 'Journal', icon: <ScrollText className="h-5 w-5" /> },
];

const PAGE_TITLES: PageTitleMap = [
  ['/org/analytics/traffic', 'Consultations du menu'],
  ['/org/analytics/publications', 'Publications'],
  ['/org/sites', 'Sites'],
  ['/org/users', 'Utilisateurs'],
  ['/org/audit', 'Journal'],
  ['/org/account', 'Mon compte'],
  ['/org', "Vue d'ensemble"],
];

const BOTTOM_NAV_PATHS = ['/org', '/org/analytics/traffic', '/org/sites', '/org/users'];

export function OrgLayout() {
  const { user } = useAuth();

  usePwaOnboarding('/org/install', user?.role === 'org_admin');

  return (
    <DashboardShell
      navItems={NAV_ITEMS}
      homePath="/org"
      bottomNavPaths={BOTTOM_NAV_PATHS}
      pageTitles={PAGE_TITLES}
      fallbackTitle="Organisation"
      accountPath="/org/account"
      tenant={
        user?.organization_name
          ? { label: 'Organisation', name: user.organization_name }
          : undefined
      }
      contentClassName="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8"
    />
  );
}
