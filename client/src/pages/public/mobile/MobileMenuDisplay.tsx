import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router';
import { trackPageView } from '@/lib/telemetry';
import { Zap, CalendarOff } from 'lucide-react';
import type { Closure } from '@/lib/api/closures';
import { jsDayToMariamDay, getNextOpeningDate } from '@/lib/service-utils';
import { parisToday, addDays, parisDayOfWeek } from '@/lib/date-utils';
import { useNow } from '@/lib/use-now';
import { usePublicMenu } from '../use-public-menu';
import { MobileHeader } from './MobileHeader';
import { MobileChefNote } from './MobileChefNote';
import { MobileDayToggle } from './MobileDayToggle';
import { MobileCategorySection } from './MobileCategorySection';
import { MobileItemDetailSheet } from './MobileItemDetailSheet';
import { MobileEventSection, MobileTodayEvent } from './MobileEventSection';
import { MobileClosureSection } from './MobileClosureSection';
import { MobileVoteCard } from './MobileVoteCard';
import { PublicShell } from '../PublicShell';
import type { MenuItemData, PublicMenuData } from '../menu-types';

function ActiveClosureMessage({ closure }: { closure: Closure }) {
  const formatRange = (start: string, end: string) => {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', opts);
    return start === end ? fmt(start) : `du ${fmt(start)} au ${fmt(end)}`;
  };

  return (
    <div className="mx-4 my-6 flex flex-col items-center gap-4 rounded-2xl border border-red-100 bg-red-50 px-6 py-8 text-center">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-red-100">
        <CalendarOff className="h-7 w-7 text-red-400" />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-bold leading-snug text-red-700">
          {closure.reason ?? 'Fermeture exceptionnelle'}
        </p>
        <p className="text-sm text-red-500">{formatRange(closure.start_date, closure.end_date)}</p>
      </div>
      {closure.description && (
        <p className="w-full whitespace-pre-line border-t border-red-100 pt-4 text-left text-sm leading-relaxed text-gray-600">
          {closure.description}
        </p>
      )}
    </div>
  );
}

const CLOSURE_WINDOW_DAYS = 14;
const CLOSURE_MAX_COUNT = 5;

/** The list arrives sorted by start_date. */
function filterUpcomingClosures(closures: Closure[], now: Date): Closure[] {
  const cutoff = addDays(parisToday(now), CLOSURE_WINDOW_DAYS);
  return closures.filter((c) => c.start_date <= cutoff).slice(0, CLOSURE_MAX_COUNT);
}

export function MobileMenuDisplay({
  org,
  restaurantSlug,
  initial,
  serverNow,
}: {
  org: string;
  restaurantSlug: string;
  initial: PublicMenuData;
  serverNow: number;
}) {
  const now = useNow(serverNow);
  const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today');

  useEffect(() => {
    trackPageView(selectedDay, org, restaurantSlug);
  }, [selectedDay, org, restaurantSlug]);
  const [selectedItem, setSelectedItem] = useState<MenuItemData | null>(null);

  const { data } = usePublicMenu(org, restaurantSlug, 'mobile', {
    data: initial,
    fetchedAt: serverNow,
  });

  const todayData = data?.today ?? null;
  const tomorrowData = data?.tomorrow ?? null;
  const todayEvent = data?.todayEvent ?? null;
  const upcomingEvents = data?.upcomingEvents ?? [];
  const activeClosure = data?.activeClosure ?? null;
  const restaurant = data?.restaurant ?? null;

  const currentData = selectedDay === 'today' ? todayData : tomorrowData;
  const visibleClosures = useMemo(
    () => filterUpcomingClosures(data?.upcomingClosures ?? [], now),
    [data?.upcomingClosures, now]
  );

  const serviceDays = restaurant?.config?.service_days ?? [];
  const mariamToday = jsDayToMariamDay(parisDayOfWeek(now));
  const mariamTomorrow = (mariamToday + 1) % 7;
  const selectedMariamDay = selectedDay === 'today' ? mariamToday : mariamTomorrow;
  const isClosedDay = serviceDays.length > 0 && !serviceDays.includes(selectedMariamDay);

  return (
    <PublicShell>
      {restaurant && (
        <MobileHeader
          site={{ org, site: restaurantSlug }}
          restaurant={restaurant}
          activeClosure={activeClosure}
          now={now}
        />
      )}

      {currentData?.menu?.chef_note && <MobileChefNote note={currentData.menu.chef_note} />}

      <MobileDayToggle selected={selectedDay} onChange={setSelectedDay} />

      <div className="flex-1 overflow-y-auto">
        {todayEvent && selectedDay === 'today' && (
          <div className="px-4 pt-4">
            <MobileTodayEvent event={todayEvent} />
          </div>
        )}

        {currentData?.menu ? (
          <MobileCategorySection
            categories={currentData.menu.by_category || []}
            onItemTap={setSelectedItem}
            substitutions={currentData.menu.substitutions}
          />
        ) : activeClosure && selectedDay === 'today' ? (
          <ActiveClosureMessage closure={activeClosure} />
        ) : isClosedDay ? (
          <ClosedDayMessage selectedDay={selectedDay} serviceDays={serviceDays} now={now} />
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-base text-gray-400">
              Aucun menu disponible pour {selectedDay === 'today' ? "aujourd'hui" : 'demain'}.
            </p>
          </div>
        )}

        {selectedDay === 'today' && currentData?.menu && restaurant && (
          <MobileVoteCard
            org={org}
            siteSlug={restaurantSlug}
            iconPreset={restaurant.vote_icon_preset}
          />
        )}

        <MobileEventSection upcomingEvents={upcomingEvents} />

        {visibleClosures.length > 0 && <MobileClosureSection closures={visibleClosures} />}

        <footer className="flex flex-col items-center gap-2 py-6 text-center">
          <a
            href="https://mariam.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-300 transition-colors hover:text-gray-400"
          >
            <Zap className="h-3 w-3" />
            Alimenté par <span className="underline">mariam.app</span>
          </a>
          <Link
            to="/privacy"
            className="text-xs text-gray-300 underline transition-colors hover:text-gray-400"
          >
            Confidentialité
          </Link>
        </footer>
      </div>

      <MobileItemDetailSheet
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </PublicShell>
  );
}

function ClosedDayMessage({
  selectedDay,
  serviceDays,
  now,
}: {
  selectedDay: 'today' | 'tomorrow';
  serviceDays: number[];
  now: Date;
}) {
  const nextOpening = getNextOpeningDate(serviceDays, now);
  const dayLabel = selectedDay === 'today' ? "aujourd'hui" : 'demain';

  return (
    <div className="space-y-2 px-6 py-16 text-center">
      <p className="text-base font-semibold text-gray-700">Le restaurant est fermé {dayLabel}.</p>
      {nextOpening && (
        <p className="text-sm text-gray-400">Prochain service : {nextOpening.label}</p>
      )}
    </div>
  );
}
