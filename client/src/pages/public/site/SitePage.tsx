import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Closure } from '@/lib/api/closures';
import type { Quality } from '@/lib/api/quality';
import type { LiveStatus, PublicOrg } from '@/lib/api/sites';
import { addDays, parisToday } from '@/lib/date-utils';
import { getServiceStatus } from '@/lib/service-utils';
import { capacityState } from '@/lib/capacity-state';
import { CapacityGauge } from '@/components/CapacityGauge';
import type { MapTiles } from '@/lib/runtime-config';
import { SCREEN_QR, trackPageView } from '@/lib/telemetry';
import { useNow } from '@/lib/use-now';
import { ClosureSection } from '../menu/ClosureSection';
import { NewsSection } from '../menu/NewsSection';
import type { SitePage as SitePageData } from '../menu-types';
import { publicMenuData } from '../public-menu-data';
import { AboutSection } from './AboutSection';
import { dayStrip, menuRange, openDays } from './days';
import { MenuBoard } from './MenuBoard';
import { PracticalInfo } from './PracticalInfo';
import { QualitySection } from './QualitySection';
import { qualityView } from './quality-view';
import { useLiveStatus } from './use-live-status';
import { useSiteDetails, useSiteMenus } from './use-site-page';
import { visitKind } from './visit-kind';
import { NotificationsPanel } from './notifications/NotificationsPanel';
import { useLaunchOffer } from './notifications/useLaunchOffer';
import { NotificationsButton, SiteHeader } from './SiteHeader';

const CLOSURES_AHEAD_DAYS = 14;
const CLOSURES_SHOWN = 5;

interface SitePageProps {
  organization: PublicOrg;
  siteSlug: string;
  multiSite: boolean;
  loadedDate: string;
  initial: SitePageData;
  initialLive: LiveStatus | null;
  quality: Quality | null;
  serverNow: number;
  mapTiles: MapTiles | null;
}

export function SitePage({
  organization,
  siteSlug,
  multiSite,
  loadedDate,
  initial,
  initialLive,
  quality,
  serverNow,
  mapTiles,
}: SitePageProps) {
  const now = useNow(serverNow);
  const today = parisToday(new Date(serverNow));
  const [params] = useSearchParams();
  const date = params.get('date') ?? today;
  const details = useSiteDetails(organization.slug, siteSlug, initial, serverNow);
  const open = openDays(details.site.menu_window, details.site.service_days, details.closures);
  const strip = dayStrip(open, today, date);
  const loaded = { from: loadedDate, to: addDays(loadedDate, 1), items: initial.menus };
  const held = useSiteMenus(
    organization.slug,
    siteSlug,
    menuRange(date, loaded, strip),
    loaded,
    serverNow
  );
  const pending = !held || date < held.from || date > held.to;
  const menu = publicMenuData({ ...details, menus: held?.items ?? [] }, now, date);
  const site = menu.restaurant;
  const inService =
    !menu.activeClosure && getServiceStatus(site.service_hours, site.service_days, now).isOpen;
  const live = useLiveStatus(organization.slug, siteSlug, {
    initial: initialLive,
    fetchedAt: serverNow,
    inService,
  });
  const reached = live ? live.capacity_reached : null;
  const qualityShown = qualityView(quality, site.quality_commitments);
  const siteRef = useMemo(
    () => ({ org: organization.slug, site: siteSlug }),
    [organization.slug, siteSlug]
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const openNotifications = useCallback(() => setNotificationsOpen(true), []);
  useLaunchOffer(siteRef, openNotifications);

  useEffect(() => {
    const url = new URL(window.location.href);
    const fromScreen = Object.entries(SCREEN_QR).every(
      ([key, value]) => url.searchParams.get(key) === value
    );
    trackPageView(visitKind(fromScreen, date, today), organization.slug, siteSlug);
    // Counted once: a reload or a shared link is not another scan.
    if (fromScreen) {
      for (const key of Object.keys(SCREEN_QR)) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, '', url);
    }
  }, [date, today, organization.slug, siteSlug]);

  const closures = [menu.activeClosure, ...menu.upcomingClosures].filter(
    (closure): closure is Closure => closure !== null
  );
  const soonClosures = menu.upcomingClosures
    .filter((closure) => closure.start_date <= addDays(today, CLOSURES_AHEAD_DAYS))
    .slice(0, CLOSURES_SHOWN);

  return (
    <div className="public-page min-h-screen text-sm leading-normal lg:text-[15px]">
      <div className="h-1 bg-site-brand-solid" />
      <SiteHeader
        organization={organization}
        multiSite={multiSite}
        site={site}
        closure={menu.activeClosure}
        now={now}
        capacityReached={reached === true}
        onOpenNotifications={openNotifications}
      />

      <main className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-8 pb-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_auto_1fr] lg:px-6 lg:pt-8">
        <div className="lg:col-start-1 lg:row-start-1">
          <MenuBoard
            org={organization.slug}
            site={site}
            day={menu.day}
            today={today}
            strip={strip}
            pending={pending}
            closure={closures.find((c) => c.start_date <= date && date <= c.end_date) ?? null}
            nextOpen={open.find((day) => day > date) ?? null}
            todayEvent={menu.todayEvent}
          />
        </div>

        {(menu.news.length > 0 || soonClosures.length > 0) && (
          <div className="flex flex-col gap-8 px-4 lg:col-start-1 lg:row-start-2 lg:px-0">
            <NewsSection news={menu.news} today={today} />
            <ClosureSection closures={soonClosures} />
          </div>
        )}

        <aside className="px-4 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:px-0">
          <PracticalInfo site={site} mapTiles={mapTiles}>
            {site.service_capacity != null && (
              <CapacityGauge
                capacity={site.service_capacity}
                state={capacityState(reached, inService)}
                reachedAt={live?.reached_at ?? null}
              />
            )}
          </PracticalInfo>
        </aside>

        <div className="flex flex-col gap-8 px-4 lg:col-start-1 lg:row-start-3 lg:px-0">
          <AboutSection site={site} />
          {qualityShown && <QualitySection view={qualityShown} />}
        </div>
      </main>

      <footer className="border-t border-site-line">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-3.5 px-4 py-6 lg:flex-row lg:justify-between lg:px-6 lg:py-5">
          <NotificationsButton onClick={openNotifications} className="w-full lg:hidden" />
          <div className="flex gap-4 text-xs text-site-subtle lg:w-full lg:justify-between lg:text-[13px]">
            <a
              href="https://mariam.app"
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 hover:text-site-text"
            >
              Alimenté par mariam.app
            </a>
            <Link to="/privacy" className="py-3 hover:text-site-text">
              Confidentialité
            </Link>
          </div>
        </div>
      </footer>

      <NotificationsPanel
        site={siteRef}
        siteName={site.name}
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
      />
    </div>
  );
}
