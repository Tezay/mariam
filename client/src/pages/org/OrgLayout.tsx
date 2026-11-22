/**
 * Director dashboard (org_admin): a cross-site view of the organization.
 * Shares its shell with the site dashboard so both stay visually identical;
 * only the navigation and the enabled top-bar features differ.
 */
import {
  LayoutDashboard,
  BookOpen,
  Building2,
  CalendarCheck,
  SmilePlus,
  TrendingUp,
  Users,
  ScrollText,
} from 'lucide-react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { type SidebarNavItem } from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { usePlace } from '@/contexts/PlaceContext';
import { ACCOUNT_PATH, orgPath } from '@/lib/dashboard-routes';
import { usePwaOnboarding } from '@/hooks/usePwaOnboarding';
import { useSecurityOnboarding } from '@/hooks/useSecurityOnboarding';

function navItems(base: string): SidebarNavItem[] {
  return [
    {
      to: base,
      label: "Vue d'ensemble",
      shortLabel: 'Résumé',
      icon: <LayoutDashboard className="h-5 w-5" />,
      end: true,
    },
    {
      to: `${base}/analytics/traffic`,
      label: 'Consultations menu',
      icon: <TrendingUp className="h-5 w-5" />,
    },
    {
      to: `${base}/analytics/satisfaction`,
      label: 'Satisfaction',
      icon: <SmilePlus className="h-5 w-5" />,
    },
    {
      to: `${base}/analytics/publications`,
      label: 'Publications',
      icon: <CalendarCheck className="h-5 w-5" />,
    },
    { to: `${base}/sites`, label: 'Sites', icon: <Building2 className="h-5 w-5" /> },
    { to: `${base}/catalog`, label: 'Catalogue', icon: <BookOpen className="h-5 w-5" /> },
    { to: `${base}/users`, label: 'Utilisateurs', icon: <Users className="h-5 w-5" /> },
    { to: `${base}/audit`, label: 'Journal', icon: <ScrollText className="h-5 w-5" /> },
  ];
}

const PAGES: [string, string][] = [
  ['/analytics/traffic', 'Consultations du menu'],
  ['/analytics/satisfaction', 'Satisfaction'],
  ['/analytics/publications', 'Publications'],
  ['/sites', 'Sites'],
  ['/catalog', 'Catalogue'],
  ['/users', 'Utilisateurs'],
  ['/audit', 'Journal'],
];

const BOTTOM_NAV_PAGES = ['', '/analytics/traffic', '/sites', '/users'];

export function OrgLayout() {
  const { user } = useAuth();
  const { place } = usePlace();
  const base = orgPath(place.org);

  useSecurityOnboarding(user, '/org/security');
  usePwaOnboarding('/org/install');

  return (
    <DashboardShell
      navItems={navItems(base)}
      homePath={base}
      bottomNavPaths={BOTTOM_NAV_PAGES.map((page) => base + page)}
      pageTitles={[
        ...PAGES.map(([page, title]): [string, string] => [base + page, title]),
        [ACCOUNT_PATH, 'Mon compte'],
        [base, "Vue d'ensemble"],
      ]}
      fallbackTitle="Organisation"
      showNotifications
      accountPath={ACCOUNT_PATH}
      contentClassName="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8"
    />
  );
}
