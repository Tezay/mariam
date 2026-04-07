/**
 * MARIAM - Affichage public du menu - Mode Mobile
 *
 * Gère le fetch des données et orchestre tous les composants mobiles.
 */
import { useState, useEffect, useRef } from 'react';
import { Zap } from 'lucide-react';
import { menusApi, eventsApi, publicApi } from '@/lib/api';
import { InlineError, getErrorType } from '@/components/InlineError';
import { jsDayToMariamDay, getNextOpeningDate } from '@/lib/service-utils';
import { MobileHeader } from './MobileHeader';
import { MobileChefNote } from './MobileChefNote';
import { MobileDayToggle } from './MobileDayToggle';
import { MobileCategorySection } from './MobileCategorySection';
import { MobileItemDetailSheet } from './MobileItemDetailSheet';
import { MobileEventSection, MobileTodayEvent } from './MobileEventSection';
import { MobileMenuSkeleton } from './MobileMenuSkeleton';
import type { MenuData, MenuItemData, EventData, RestaurantPublic } from '../menu-types';

const LOADING_SPINNER_DELAY_MS = 3000;
const ERROR_GRACE_PERIOD_MS = 20000;
const RETRY_INTERVAL_MS = 500;

export function MobileMenuDisplay() {
    const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today');
    const [todayData, setTodayData] = useState<MenuData | null>(null);
    const [tomorrowData, setTomorrowData] = useState<MenuData | null>(null);
    const [todayEvent, setTodayEvent] = useState<EventData | null>(null);
    const [upcomingEvents, setUpcomingEvents] = useState<EventData[]>([]);
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
        if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); errorTimerRef.current = null; }
        if (skeletonTimerRef.current) { clearTimeout(skeletonTimerRef.current); skeletonTimerRef.current = null; }
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    };

    const attemptLoad = async (requestId: number) => {
        setIsLoading(true);
        try {
            const restaurantPromise = restaurantRef.current
                ? Promise.resolve(restaurantRef.current)
                : publicApi.getRestaurant();

            const [today, tomorrow, eventsData, restaurantData] = await Promise.all([
                menusApi.getToday(),
                menusApi.getTomorrow(),
                eventsApi.getPublic('mobile'),
                restaurantPromise,
            ]);

            if (requestId !== requestIdRef.current) return;

            setTodayData(today);
            setTomorrowData(tomorrow);
            setTodayEvent(eventsData?.today_event || null);
            setUpcomingEvents(eventsData?.upcoming_events || []);

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
            if (remaining <= 0) { setShowError(true); return; }
            errorTimerRef.current = setTimeout(() => setShowError(true), remaining);
            retryTimerRef.current = setTimeout(() => attemptLoad(requestId), Math.min(RETRY_INTERVAL_MS, remaining));
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
        loadData();
        const interval = setInterval(loadData, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => () => clearTimers(), []);

    const currentData = selectedDay === 'today' ? todayData : tomorrowData;
    const isPending = isLoading || (Boolean(error) && !showError);

    if (error && showError) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
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
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header restaurant */}
            {restaurant && <MobileHeader restaurant={restaurant} />}

            {/* Note du chef */}
            {currentData?.menu?.chef_note && (
                <MobileChefNote note={currentData.menu.chef_note} />
            )}

            {/* Toggle Aujourd'hui / Demain */}
            <MobileDayToggle selected={selectedDay} onChange={setSelectedDay} />

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto">
                {isPending ? (
                    showSkeleton ? (
                        <MobileMenuSkeleton />
                    ) : (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mariam-blue" />
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
                            />
                        ) : isClosedDay ? (
                            <ClosedDayMessage
                                selectedDay={selectedDay}
                                serviceDays={serviceDays}
                            />
                        ) : (
                            <div className="text-center py-16 px-6">
                                <p className="text-gray-400 text-base">
                                    Aucun menu disponible pour {selectedDay === 'today' ? "aujourd'hui" : 'demain'}.
                                </p>
                            </div>
                        )}

                        {/* Événements à venir — toujours affichés */}
                        <MobileEventSection upcomingEvents={upcomingEvents} />
                    </>
                )}

                {/* Footer */}
                <footer className="py-6 text-center">
                    <a
                        href="https://mariam.app"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-gray-400 transition-colors"
                    >
                        <Zap className="w-3 h-3" />
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

function ClosedDayMessage({ selectedDay, serviceDays }: { selectedDay: 'today' | 'tomorrow'; serviceDays: number[] }) {
    const nextOpening = getNextOpeningDate(serviceDays);
    const dayLabel = selectedDay === 'today' ? "aujourd'hui" : 'demain';

    return (
        <div className="text-center py-16 px-6 space-y-2">
            <p className="text-gray-700 text-base font-semibold">
                Le restaurant est fermé {dayLabel}.
            </p>
            {nextOpening && (
                <p className="text-gray-400 text-sm">
                    Prochain service : {nextOpening.label}
                </p>
            )}
        </div>
    );
}
