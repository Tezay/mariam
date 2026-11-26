import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { usePlace } from '@/contexts/PlaceContext';
import { useSiteRef } from '@/contexts/SiteContext';
import { ACCOUNT_PATH, sitePath } from '@/lib/dashboard-routes';
import { sitesApi, type ServiceHours } from '@/lib/api/sites';
import { isInServiceHours } from '@/lib/utils';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { type SidebarNavItem } from '@/components/layout/Sidebar';
import { type PageTitleMap } from '@/components/layout/Topbar';
import { usePwaOnboarding } from '@/hooks/usePwaOnboarding';
import { useSecurityOnboarding } from '@/hooks/useSecurityOnboarding';
import { TourHost } from '@/features/tour/TourHost';
import { subscriptionBanner } from '@/features/subscription/subscription-view';
import { useSiteSubscription } from '@/features/subscription/useSubscription';
import { SUPPORT_EMAIL } from '@/lib/runtime-config';
import {
  CalendarDays,
  ChartColumn,
  ChefHat,
  BookOpen,
  Newspaper,
  Users,
  Settings,
  Shield,
  Globe,
  Lock,
  BadgeCheck,
  CalendarClock,
  X,
} from 'lucide-react';

const PAGES: [string, string][] = [
  ['/calendar', 'Calendrier'],
  ['/service', 'Service en cours'],
  ['/catalogue', 'Catalogue'],
  ['/news', 'Actualités'],
  ['/closures', 'Fermetures'],
  ['/stats', 'Statistiques'],
  ['/users', 'Utilisateurs'],
  ['/settings', 'Mon restaurant'],
  ['/subscription', 'Abonnement'],
  ['/public-page', 'Page publique'],
  ['/audit-logs', "Logs d'audit"],
];

const BOTTOM_NAV_PAGES = ['/calendar', '/service', '/catalogue', '/stats'];

const ADMIN_ONLY_PAGES = ['/users', '/settings', '/subscription', '/public-page', '/audit-logs'];

export function AdminLayout() {
  const { user } = useAuth();
  const site = useSiteRef();
  const { role } = usePlace();
  const { pathname } = useLocation();
  const base = sitePath(site);
  const [serviceHours, setServiceHours] = useState<ServiceHours>({});
  const [duringService, setDuringService] = useState(false);
  const [siteDisabled, setSiteDisabled] = useState(false);
  const { data: subscription } = useSiteSubscription(site, role === 'admin');
  const [renewalHidden, setRenewalHidden] = useState(false);

  useSecurityOnboarding(user, '/admin/security');
  usePwaOnboarding('/admin/install');

  useEffect(() => {
    window.umami?.identify({ role });
  }, [role]);

  useEffect(() => {
    sitesApi
      .getOwn(site)
      .then((own) => {
        setServiceHours(own.service_hours);
        setSiteDisabled(own.is_active === false);
      })
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
    { to: `${base}/calendar`, label: 'Calendrier', icon: <CalendarDays className="h-5 w-5" /> },
    {
      to: `${base}/service`,
      label: 'Service en cours',
      shortLabel: 'Service',
      icon: <ChefHat className="h-5 w-5" />,
      badge: servicePulse,
    },
    { to: `${base}/catalogue`, label: 'Catalogue', icon: <BookOpen className="h-5 w-5" /> },
    { to: `${base}/news`, label: 'Actualités', icon: <Newspaper className="h-5 w-5" /> },
    {
      to: `${base}/stats`,
      label: 'Statistiques',
      shortLabel: 'Stats',
      icon: <ChartColumn className="h-5 w-5" />,
    },
    { to: `${base}/users`, label: 'Utilisateurs', icon: <Users className="h-5 w-5" /> },
    {
      to: `${base}/settings`,
      label: 'Mon restaurant',
      shortLabel: 'Restaurant',
      icon: <Settings className="h-5 w-5" />,
    },
    ...(subscription && subscription.state !== 'none'
      ? [
          {
            to: `${base}/subscription`,
            label: 'Abonnement',
            icon: <BadgeCheck className="h-5 w-5" />,
          },
        ]
      : []),
    {
      to: `${base}/public-page`,
      label: 'Page publique',
      shortLabel: 'Page',
      icon: <Globe className="h-5 w-5" />,
    },
    { to: `${base}/audit-logs`, label: "Logs d'audit", icon: <Shield className="h-5 w-5" /> },
  ];

  const adminOnly = ADMIN_ONLY_PAGES.map((page) => base + page);
  const filteredNavItems = navItems.filter(
    (item) => !adminOnly.includes(item.to) || role === 'admin'
  );
  const pageTitles: PageTitleMap = [
    ...PAGES.map(([page, title]): [string, string] => [base + page, title]),
    [ACCOUNT_PATH, 'Mon compte'],
    [base, 'Calendrier'],
  ];

  const renewal =
    subscription && !renewalHidden && pathname !== `${base}/subscription`
      ? subscriptionBanner(subscription)
      : null;
  const banner = siteDisabled ? (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground sm:px-6"
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Ce site est désactivé : sa page publique n'est plus accessible et ses données ne peuvent
        plus être modifiées. Elles restent consultables. Pour le réactiver ou obtenir une copie de
        vos données, écrivez au support
        {SUPPORT_EMAIL && (
          <>
            {' '}
            :{' '}
            <a className="font-medium text-foreground underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </>
        )}
        .
      </p>
    </div>
  ) : renewal ? (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200 sm:px-6"
    >
      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">
        {renewal}{' '}
        <Link to={`${base}/subscription`} className="font-medium underline">
          Voir l'abonnement
        </Link>
      </p>
      <button
        type="button"
        aria-label="Masquer"
        onClick={() => setRenewalHidden(true)}
        className="-m-1 shrink-0 rounded-xl p-1 hover:bg-amber-100 dark:hover:bg-amber-500/20"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  ) : undefined;

  // One of its steps points at the calendar's own toolbar.
  const onCalendar = pathname === base || pathname.startsWith(`${base}/calendar`);

  return (
    <>
      <DashboardShell
        navItems={filteredNavItems}
        homePath={base}
        bottomNavPaths={BOTTOM_NAV_PAGES.map((page) => base + page)}
        pageTitles={pageTitles}
        fallbackTitle="Admin"
        showSearch
        showNotifications
        accountPath={ACCOUNT_PATH}
        banner={banner}
      />
      <TourHost tour="orientation" enabled={onCalendar} canSeeStats={role === 'admin'} />
    </>
  );
}
