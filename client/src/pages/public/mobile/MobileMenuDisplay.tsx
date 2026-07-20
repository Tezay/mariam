/**
 * MARIAM - Affichage public du menu - Mode Mobile
 *
 * Gère le fetch des données et orchestre tous les composants mobiles.
 */
import { useState, useMemo } from 'react';
import { Zap, CalendarOff } from 'lucide-react';
import { ExceptionalClosure } from '@/lib/api';
import { InlineError, getErrorType } from '@/components/InlineError';
import { jsDayToMariamDay, getNextOpeningDate } from '@/lib/service-utils';
import { parisToday, addDays, parisDayOfWeek } from '@/lib/date-utils';
import { usePublicMenu } from '../use-public-menu';
import { MobileHeader } from './MobileHeader';
import { MobileChefNote } from './MobileChefNote';
import { MobileDayToggle } from './MobileDayToggle';
import { MobileCategorySection } from './MobileCategorySection';
import { MobileItemDetailSheet } from './MobileItemDetailSheet';
import { MobileEventSection, MobileTodayEvent } from './MobileEventSection';
import { MobileClosureSection } from './MobileClosureSection';
import { MobileMenuSkeleton } from './MobileMenuSkeleton';
import type { MenuItemData } from '../menu-types';

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
  const [selectedItem, setSelectedItem] = useState<MenuItemData | null>(null);

  const { data, isPending, isError, error, refetch } = usePublicMenu(restaurantSlug, 'mobile');

  const todayData = data?.today ?? null;
  const tomorrowData = data?.tomorrow ?? null;
  const todayEvent = data?.todayEvent ?? null;
  const upcomingEvents = data?.upcomingEvents ?? [];
  const activeClosure = data?.activeClosure ?? null;
  const restaurant = data?.restaurant ?? null;

  const currentData = selectedDay === 'today' ? todayData : tomorrowData;
  const visibleClosures = useMemo(
    () => filterUpcomingClosures(data?.upcomingClosures ?? []),
    [data?.upcomingClosures]
  );

  // Show the error screen only when there is no data at all to display.
  if (isError && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <InlineError type={getErrorType(error)} onRetry={() => refetch()} showLogo={true} />
      </div>
    );
  }

  // Détecter si le jour sélectionné est un jour de fermeture
  const serviceDays = restaurant?.config?.service_days ?? [];
  const mariamToday = jsDayToMariamDay(parisDayOfWeek());
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
          <MobileMenuSkeleton />
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
