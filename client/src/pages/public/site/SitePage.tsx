import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
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
import type { PublicMenuData } from '../menu-types';
import { usePublicMenu } from '../use-public-menu';
import { AboutSection } from './AboutSection';
import { dayStrip, openDays } from './days';
import { MenuBoard } from './MenuBoard';
import { PracticalInfo } from './PracticalInfo';
import { QualitySection } from './QualitySection';
import { qualityView } from './quality-view';
import { useLiveStatus } from './use-live-status';
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
  date: string;
  initial: PublicMenuData;
  initialLive: LiveStatus | null;
  quality: Quality | null;
  serverNow: number;
  mapTiles: MapTiles | null;
}

export function SitePage({
  organization,
  siteSlug,
  multiSite,
  date,
  initial,
  initialLive,
  quality,
  serverNow,
  mapTiles,
}: SitePageProps) {
  const now = useNow(serverNow);
  const today = parisToday(new Date(serverNow));
  const { data } = usePublicMenu(organization.slug, siteSlug, 'mobile', {
    date,
    initial: { data: initial, fetchedAt: serverNow },
  });
  const menu = data ?? initial;
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
  const open = openDays(site.menu_window, site.service_days, closures);
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
            strip={dayStrip(open, today, date)}
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
