/**
 * MARIAM - Affichage public du menu - Mode Mobile
 *
 * Gère le fetch des données et orchestre tous les composants mobiles.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { Zap, CalendarOff } from 'lucide-react';
import { menusApi, eventsApi, publicApi, closuresApi, ExceptionalClosure } from '@/lib/api';
import { InlineError, getErrorType } from '@/components/InlineError';
import { jsDayToMariamDay, getNextOpeningDate } from '@/lib/service-utils';
import { parisToday, addDays } from '@/lib/date-utils';
import { MobileHeader } from './MobileHeader';
import { MobileChefNote } from './MobileChefNote';
import { MobileDayToggle } from './MobileDayToggle';
import { MobileCategorySection } from './MobileCategorySection';
import { MobileItemDetailSheet } from './MobileItemDetailSheet';
import { MobileEventSection, MobileTodayEvent } from './MobileEventSection';
import { MobileClosureSection } from './MobileClosureSection';
import { MobileMenuSkeleton } from './MobileMenuSkeleton';
import type { MenuData, MenuItemData, EventData, RestaurantPublic } from '../menu-types';

const LOADING_SPINNER_DELAY_MS = 3000;
const ERROR_GRACE_PERIOD_MS = 20000;
const RETRY_INTERVAL_MS = 500;

function ActiveClosureMessage({ closure }: { closure: ExceptionalClosure }) {
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

/** Fenêtre d'affichage des fermetures à venir sur mobile */
const CLOSURE_WINDOW_DAYS = 14;
const CLOSURE_MAX_COUNT = 5;

/** Ne garde que les fermetures commençant dans les 14 prochains jours, plafonnées à 5.
 *  La liste reçue est déjà triée par start_date croissant (backend). */
function filterUpcomingClosures(closures: ExceptionalClosure[]): ExceptionalClosure[] {
  const cutoff = addDays(parisToday(), CLOSURE_WINDOW_DAYS);
  return closures.filter((c) => c.start_date <= cutoff).slice(0, CLOSURE_MAX_COUNT);
}

export function MobileMenuDisplay({ restaurantSlug }: { restaurantSlug: string }) {
  const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today');
  const [todayData, setTodayData] = useState<MenuData | null>(null);
  const [tomorrowData, setTomorrowData] = useState<MenuData | null>(null);
  const [todayEvent, setTodayEvent] = useState<EventData | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<EventData[]>([]);
  const [activeClosure, setActiveClosure] = useState<ExceptionalClosure | null>(null);
  const [upcomingClosures, setUpcomingClosures] = useState<ExceptionalClosure[]>([]);
  const [restaurant, setRestaurant] = useState<RestaurantPublic | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItemData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showError, setShowError] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);

  const loadStartRef = useRef<number>(0);
  const requestIdRef = useRef(0);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restaurantRef = useRef<RestaurantPublic | null>(null);

  const clearTimers = () => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    if (skeletonTimerRef.current) {
      clearTimeout(skeletonTimerRef.current);
      skeletonTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const attemptLoad = async (requestId: number) => {
    setIsLoading(true);
    try {
      const restaurantPromise = restaurantRef.current
        ? Promise.resolve(restaurantRef.current)
        : publicApi.getRestaurant(restaurantSlug);

      const [today, tomorrow, eventsData, restaurantData, closuresData] = await Promise.all([
        menusApi.getToday(restaurantSlug),
        menusApi.getTomorrow(restaurantSlug),
        eventsApi.getPublic(restaurantSlug, 'mobile'),
        restaurantPromise,
        closuresApi.getPublic(restaurantSlug),
      ]);

      if (requestId !== requestIdRef.current) return;

      setTodayData(today);
      setTomorrowData(tomorrow);
      setTodayEvent(eventsData?.today_event || null);
      setUpcomingEvents(eventsData?.upcoming_events || []);
      setActiveClosure(closuresData?.current_closure || null);
      setUpcomingClosures(closuresData?.upcoming_closures || []);

      if (restaurantData && !restaurantRef.current) {
        restaurantRef.current = restaurantData;
        setRestaurant(restaurantData);
      }

      setError(null);
      setShowError(false);
      clearTimers();
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err);
      const elapsed = Date.now() - loadStartRef.current;
      const remaining = ERROR_GRACE_PERIOD_MS - elapsed;
      if (remaining <= 0) {
        setShowError(true);
        return;
      }
      errorTimerRef.current = setTimeout(() => setShowError(true), remaining);
      retryTimerRef.current = setTimeout(
        () => attemptLoad(requestId),
        Math.min(RETRY_INTERVAL_MS, remaining)
      );
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  };

  const loadData = () => {
    clearTimers();
    const requestId = ++requestIdRef.current;
    loadStartRef.current = Date.now();
    setIsLoading(true);
    setError(null);
    setShowError(false);
    setShowSkeleton(false);
    skeletonTimerRef.current = setTimeout(() => setShowSkeleton(true), LOADING_SPINNER_DELAY_MS);
    attemptLoad(requestId);
  };

  useEffect(() => {
    restaurantRef.current = null;
  }, [restaurantSlug]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [restaurantSlug]);

  useEffect(() => () => clearTimers(), []);

  const currentData = selectedDay === 'today' ? todayData : tomorrowData;
  const isPending = isLoading || (Boolean(error) && !showError);
  const visibleClosures = useMemo(
    () => filterUpcomingClosures(upcomingClosures),
    [upcomingClosures]
  );

  if (error && showError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <InlineError type={getErrorType(error)} onRetry={loadData} showLogo={true} />
      </div>
    );
  }

  // Détecter si le jour sélectionné est un jour de fermeture
  const serviceDays = restaurant?.config?.service_days ?? [];
  const mariamToday = jsDayToMariamDay(new Date().getDay());
  const mariamTomorrow = (mariamToday + 1) % 7;
  const selectedMariamDay = selectedDay === 'today' ? mariamToday : mariamTomorrow;
  const isClosedDay = serviceDays.length > 0 && !serviceDays.includes(selectedMariamDay);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header restaurant */}
      {restaurant && <MobileHeader restaurant={restaurant} activeClosure={activeClosure} />}

      {/* Note du chef */}
      {currentData?.menu?.chef_note && <MobileChefNote note={currentData.menu.chef_note} />}

      {/* Toggle Aujourd'hui / Demain */}
      <MobileDayToggle selected={selectedDay} onChange={setSelectedDay} />

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto">
        {isPending ? (
          showSkeleton ? (
            <MobileMenuSkeleton />
          ) : (
            <div className="flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-mariam-blue" />
            </div>
          )
        ) : (
          <>
            {/* Événement du jour — en tête de page, toujours mis en avant */}
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
              <ClosedDayMessage selectedDay={selectedDay} serviceDays={serviceDays} />
            ) : (
              <div className="px-6 py-16 text-center">
                <p className="text-base text-gray-400">
                  Aucun menu disponible pour {selectedDay === 'today' ? "aujourd'hui" : 'demain'}.
                </p>
              </div>
            )}

            {/* Événements à venir — toujours affichés */}
            <MobileEventSection upcomingEvents={upcomingEvents} />

            {/* Fermetures exceptionnelles à venir */}
            {visibleClosures.length > 0 && <MobileClosureSection closures={visibleClosures} />}
          </>
        )}

        {/* Footer */}
        <footer className="py-6 text-center">
          <a
            href="https://mariam.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-300 transition-colors hover:text-gray-400"
          >
            <Zap className="h-3 w-3" />
            Alimenté par <span className="underline">mariam.app</span>
          </a>
        </footer>
      </div>

      {/* Sheet détail item */}
      <MobileItemDetailSheet
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}

function ClosedDayMessage({
  selectedDay,
  serviceDays,
}: {
  selectedDay: 'today' | 'tomorrow';
  serviceDays: number[];
}) {
  const nextOpening = getNextOpeningDate(serviceDays);
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
