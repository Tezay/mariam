/**
 * MARIAM - Affichage public du menu
 * 
 * Mode TV (plein écran) et Mobile (compact).
 * Intègre l'affichage des événements :
 * - Jour J : bannière événement (titre, sous-titre, images, couleur)
 * - À venir : vignette compacte du prochain événement
 */
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicApi, MenuCategory, DietaryTag, Certification } from '@/lib/api';
import { DEFAULT_CATEGORIES, DEFAULT_DIETARY_TAGS, DEFAULT_CERTIFICATIONS } from '@/lib/constants';
import { generateEventPalette } from '@/lib/color-utils';
import { Icon } from '@/components/ui/icon-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { Logo } from '@/components/Logo';
import { NotificationBell } from '@/components/NotificationBell';
import { InlineError, getErrorType } from '@/components/InlineError';
import { Leaf, BadgeCheck, Ban, WheatOff, MilkOff, Sprout, MapPin, Flag, Fish, RefreshCw, ZoomIn, ZoomOut, CalendarClock, ChevronLeft, ChevronRight, Megaphone, Calendar, ChefHat, X, Image as ImageIcon } from 'lucide-react';
import type { IconName } from '@/components/ui/icon-picker';

// Types pour les données de menu
interface MenuItemData {
    name: string;
    category: string;
    is_vegetarian?: boolean;
    is_halal?: boolean;
    is_pork_free?: boolean;
    tags?: string[];
    certifications?: string[];
}

interface MenuResponse {
    date: string;
    items: MenuItemData[];
    by_category: Record<string, MenuItemData[]>;
    entrees?: MenuItemData[];
    plat?: MenuItemData[];
    vg?: MenuItemData[];
    desserts?: MenuItemData[];
    images?: { id: number; url: string; filename?: string; order: number }[];
    chef_note?: string;
}

interface MenuData {
    date: string;
    day_name: string;
    menu: MenuResponse | null;
    restaurant?: {
        name: string;
        logo_url?: string;
        config?: {
            menu_categories: MenuCategory[];
            dietary_tags: DietaryTag[];
            certifications: Certification[];
        };
    };
}

interface EventData {
    id: number;
    title: string;
    subtitle?: string;
    description?: string;
    color?: string;
    event_date: string;
    images?: { id: number; url: string; filename?: string; order: number }[];
}



const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
    'leaf': Leaf,
    'badge-check': BadgeCheck,
    'ban': Ban,
    'wheat-off': WheatOff,
    'milk-off': MilkOff,
    'sprout': Sprout,
    'map-pin': MapPin,
    'flag': Flag,
    'fish': Fish,
};

const LOADING_SPINNER_DELAY_MS = 3000;
const ERROR_GRACE_PERIOD_MS = 20000;
const RETRY_INTERVAL_MS = 500;

function getItemsByCategory(menu: MenuResponse | null, categoryId: string): MenuItemData[] {
    if (!menu) return [];

    if (menu.by_category && menu.by_category[categoryId]) {
        return menu.by_category[categoryId];
    }

    // Fallback
    const legacyKey = categoryId === 'entree' ? 'entrees' :
        categoryId === 'dessert' ? 'desserts' : categoryId;
    if (menu[legacyKey as keyof MenuResponse]) {
        return menu[legacyKey as keyof MenuResponse] as MenuItemData[];
    }

    return [];
}

// Rendu icons
function renderIcon(iconName: string, className?: string) {
    const IconComponent = ICON_COMPONENTS[iconName];
    if (IconComponent) {
        return <IconComponent className={className || 'w-4 h-4'} />;
    }
    return <Icon name={iconName as IconName} className={className || 'w-4 h-4'} />;
}

function ItemBadge({ icon, label, color }: { icon: string; label: string; color: string }) {
    const colorClasses: Record<string, string> = {
        green: 'bg-green-100 text-green-700 border-green-200',
        teal: 'bg-teal-100 text-teal-700 border-teal-200',
        orange: 'bg-orange-100 text-orange-700 border-orange-200',
        blue: 'bg-blue-100 text-blue-700 border-blue-200',
        indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        amber: 'bg-amber-100 text-amber-700 border-amber-200',
        cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    };

    return (
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${colorClasses[color] || 'bg-gray-100 text-gray-700'}`}>
            {renderIcon(icon, 'w-3 h-3')} {label}
        </span>
    );
}

function MobileMenuSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex justify-center">
                <Skeleton className="h-4 w-32" />
            </div>
            {[0, 1, 2].map((index) => (
                <section key={index} className="rounded-lg p-4 shadow-sm bg-white">
                    <div className="flex items-center gap-2 mb-3">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-4 w-1/2" />
                    </div>
                </section>
            ))}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────
 *  Composants Événements — TV
 * ───────────────────────────────────────────────────────────────────── */

/** Carrousel d'images auto-rotatif (TV) */
function TvImageCarousel({ images, interval = 4000 }: { images: { id: number; url: string; order: number }[]; interval?: number }) {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (images.length <= 1) return;
        const timer = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % images.length);
        }, interval);
        return () => clearInterval(timer);
    }, [images.length, interval]);

    if (images.length === 0) return null;

    return (
        <div className="relative w-full h-full overflow-hidden">
            {images.map((img, i) => (
                <img
                    key={img.id}
                    src={img.url}
                    alt=""
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
                        i === currentIndex ? 'opacity-100' : 'opacity-0'
                    }`}
                />
            ))}
        </div>
    );
}

/** Bannière événement du jour — pleine largeur sous le header TV */
function TvTodayEventBanner({ event }: { event: EventData }) {
    const palette = generateEventPalette(event.color || '#3498DB');
    const hasImages = event.images && event.images.length > 0;

    return (
        <div
            className="w-full px-10 py-8 flex items-center gap-10 border-b shadow-sm shrink-0 relative overflow-hidden"
            style={{ backgroundColor: palette.bg, borderColor: palette.border }}
        >

            {/* Image carousel */}
            {hasImages && (
                <div
                    className="w-48 h-48 rounded-2xl overflow-hidden shrink-0 shadow-lg border-2"
                    style={{ borderColor: palette.accent }}
                >
                    <TvImageCarousel images={event.images!} interval={4000} />
                </div>
            )}

            {/* Event info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 mb-3">
                    <span
                        className="text-lg font-bold uppercase tracking-widest px-4 py-1.5 rounded-xl"
                        style={{ backgroundColor: palette.button, color: palette.buttonText }}
                    >
                        <Megaphone className="w-5 h-5 inline mr-1" /> Aujourd'hui
                    </span>
                </div>
                <h2
                    className="text-5xl font-extrabold leading-tight mb-2 truncate"
                    style={{ color: palette.text }}
                >
                    {event.title}
                </h2>
                {event.subtitle && (
                    <p className="text-3xl font-light truncate" style={{ color: palette.textMuted }}>
                        {event.subtitle}
                    </p>
                )}
            </div>
        </div>
    );
}

/** Vignette événement à venir — pleine largeur footer TV */
function TvUpcomingEventFooter({ event }: { event: EventData }) {
    const palette = generateEventPalette(event.color || '#3498DB');
    const hasImage = event.images && event.images.length > 0;

    return (
        <div
            className="w-full px-10 py-4 flex items-center gap-8 border-t"
            style={{ backgroundColor: palette.bg, borderColor: palette.border }}
        >
            {hasImage ? (
                <div
                    className="w-16 h-16 rounded-xl overflow-hidden shrink-0 shadow border"
                    style={{ borderColor: palette.accent }}
                >
                    <img src={event.images![0].url} alt="" className="w-full h-full object-cover" />
                </div>
            ) : (
                <div
                    className="w-14 h-14 rounded-xl shrink-0 shadow border flex items-center justify-center"
                    style={{ borderColor: palette.accent, backgroundColor: palette.card }}
                >
                    <Megaphone className="w-7 h-7" style={{ color: palette.accent }} />
                </div>
            )}
            <div className="flex-1 min-w-0 flex items-center gap-6">
                <span
                    className="text-base font-bold uppercase tracking-widest px-3 py-1 rounded-xl shrink-0"
                    style={{ backgroundColor: palette.button, color: palette.buttonText }}
                >
                    Prochain événement
                </span>
                <p className="text-3xl font-bold truncate flex-1 min-w-0" style={{ color: palette.text }}>
                    {event.title}
                </p>
                <span className="text-2xl shrink-0 ml-auto flex items-center gap-2" style={{ color: palette.accent }}>
                    <Calendar className="w-5 h-5" /> {new Date(event.event_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
            </div>
        </div>
    );
}

/** Bandeau « Menu de demain » — footer TV */
function TvTomorrowFooter({ menu, getItems }: { menu: MenuResponse; getItems: (m: MenuResponse | null, catId: string) => MenuItemData[] }) {
    return (
        <div className="w-full bg-gray-100/95 backdrop-blur-md text-gray-800 px-10 py-4 flex items-center gap-6 border-t border-gray-200">
            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                <CalendarClock className="w-8 h-8 text-mariam-blue" />
            </div>
            <div className="flex items-baseline gap-4">
                <span className="text-gray-500 text-2xl uppercase tracking-wider font-bold">Demain :</span>
                <span className="text-4xl font-bold text-mariam-blue tracking-tight">
                    {getItems(menu, 'plat')[0]?.name || 'Menu surprise'}
                </span>
            </div>
        </div>
    );
}

/** Bandeau « Note du chef » — footer TV */
function TvChefNoteFooter({ note }: { note: string }) {
    return (
        <div className="w-full bg-amber-50/95 backdrop-blur-md text-gray-800 px-10 py-4 flex items-center gap-6 border-t border-amber-200">
            <div className="bg-white p-3 rounded-xl shadow-sm border border-amber-100">
                <ChefHat className="w-8 h-8 text-amber-600" />
            </div>
            <p className="text-3xl font-bold text-amber-700">Note du chef :</p>
            <p className="text-3xl text-gray-700 italic leading-snug truncate">
                « {note} »
            </p>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────
 *  Composants Événements — Mobile
 * ───────────────────────────────────────────────────────────────────── */

/** Carrousel d'images tactile avec défilement automatique (Mobile) */
function MobileImageCarousel({ images, interval = 4000 }: { images: { id: number; url: string; order: number }[]; interval?: number }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const touchStartRef = useRef<number | null>(null);
    const touchDeltaRef = useRef(0);
    const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const count = images.length;

    // Défilement automatique
    useEffect(() => {
        if (count <= 1) return;
        const start = () => {
            autoTimerRef.current = setInterval(() => {
                setCurrentIndex(prev => (prev + 1) % count);
            }, interval);
        };
        start();
        return () => { if (autoTimerRef.current) clearInterval(autoTimerRef.current); };
    }, [count, interval]);

    // Reset timer au swipe
    const resetTimer = () => {
        if (autoTimerRef.current) clearInterval(autoTimerRef.current);
        if (count > 1) {
            autoTimerRef.current = setInterval(() => {
                setCurrentIndex(prev => (prev + 1) % count);
            }, interval);
        }
    };

    const onTouchStart = (e: React.TouchEvent) => {
        touchStartRef.current = e.touches[0].clientX;
        touchDeltaRef.current = 0;
    };

    const onTouchMove = (e: React.TouchEvent) => {
        if (touchStartRef.current === null) return;
        touchDeltaRef.current = e.touches[0].clientX - touchStartRef.current;
    };

    const onTouchEnd = () => {
        const delta = touchDeltaRef.current;
        const threshold = 50;
        if (delta < -threshold) {
            setCurrentIndex(prev => (prev + 1) % count);
            resetTimer();
        } else if (delta > threshold) {
            setCurrentIndex(prev => (prev - 1 + count) % count);
            resetTimer();
        }
        touchStartRef.current = null;
        touchDeltaRef.current = 0;
    };

    if (count === 0) return null;

    return (
        <div
            className="relative w-full overflow-hidden rounded-xl"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            <div className="aspect-[4/3] w-full bg-gray-100">
                {images.map((img, i) => (
                    <img
                        key={img.id}
                        src={img.url}
                        alt=""
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                            i === currentIndex ? 'opacity-100' : 'opacity-0'
                        }`}
                    />
                ))}
            </div>

            {/* Pagination dots */}
            {count > 1 && (
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => { setCurrentIndex(i); resetTimer(); }}
                            className={`w-2 h-2 rounded-full transition-all ${
                                i === currentIndex
                                    ? 'bg-white scale-125 shadow'
                                    : 'bg-white/50'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/** Bannière événement du jour — Mobile (avec overlay détail) */
function MobileTodayEvent({ event }: { event: EventData }) {
    const [showDetail, setShowDetail] = useState(false);
    const [detailImgIndex, setDetailImgIndex] = useState(0);
    const palette = generateEventPalette(event.color || '#3498DB');
    const hasImages = event.images && event.images.length > 0;

    // Formater la description : markdown basique -> HTML
    const formatDescription = (text: string) => {
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-4 mb-1">$1</h3>')
            .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
            .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
            .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
            .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul class="my-2 space-y-1">${m}</ul>`)
            .replace(/\n{2,}/g, '</p><p class="mt-3">')
            .replace(/\n/g, '<br/>');
    };

    return (
        <>
            <div
                className="rounded-xl overflow-hidden shadow-md border mb-4"
                style={{ backgroundColor: palette.bg, borderColor: palette.border }}
            >
                {/* Image banner */}
                {hasImages && (
                    <div className="w-full h-40 overflow-hidden">
                        <TvImageCarousel images={event.images!} interval={5000} />
                    </div>
                )}

                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <span
                                className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg mb-2"
                                style={{ backgroundColor: palette.button, color: palette.buttonText }}
                            >
                                Aujourd'hui
                            </span>
                            <h3
                                className="text-lg font-bold leading-tight"
                                style={{ color: palette.text }}
                            >
                                {event.title}
                            </h3>
                            {event.subtitle && (
                                <p className="text-sm mt-0.5" style={{ color: palette.textMuted }}>
                                    {event.subtitle}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* CTA pour en savoir plus */}
                    {event.description && (
                        <div className="mt-3">
                            <button
                                onClick={() => { setDetailImgIndex(0); setShowDetail(true); }}
                                className="flex items-center gap-1 text-sm font-medium transition-colors"
                                style={{ color: palette.accent }}
                            >
                                En savoir plus
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Overlay détail événement */}
            {showDetail && (
                <div
                    className="fixed inset-0 z-50 flex flex-col bg-white animate-in slide-in-from-bottom duration-300"
                >
                    {/* Header overlay */}
                    <div
                        className="shrink-0 px-4 py-3 flex items-center justify-between border-b"
                        style={{ backgroundColor: palette.bg, borderColor: palette.border }}
                    >
                        <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-bold truncate" style={{ color: palette.text }}>
                                {event.title}
                            </h2>
                            {event.subtitle && (
                                <p className="text-sm truncate" style={{ color: palette.textMuted }}>{event.subtitle}</p>
                            )}
                        </div>
                        <button
                            onClick={() => setShowDetail(false)}
                            className="p-2 rounded-full hover:bg-black/10 transition-colors ml-2 shrink-0"
                        >
                            <X className="w-5 h-5" style={{ color: palette.text }} />
                        </button>
                    </div>

                    {/* Contenu scrollable */}
                    <div className="flex-1 overflow-y-auto">
                        {/* Galerie images */}
                        {hasImages && (
                            <div className="relative">
                                <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
                                    <img
                                        src={event.images![detailImgIndex].url}
                                        alt=""
                                        className="w-full h-full object-cover transition-opacity duration-300"
                                    />
                                </div>
                                {event.images!.length > 1 && (
                                    <>
                                        <button
                                            onClick={() => setDetailImgIndex(prev => (prev - 1 + event.images!.length) % event.images!.length)}
                                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full backdrop-blur-sm transition-colors"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => setDetailImgIndex(prev => (prev + 1) % event.images!.length)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full backdrop-blur-sm transition-colors"
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                        {/* Pagination dots */}
                                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                                            {event.images!.map((_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setDetailImgIndex(i)}
                                                    className={`w-2 h-2 rounded-full transition-all ${
                                                        i === detailImgIndex
                                                            ? 'bg-white scale-125 shadow'
                                                            : 'bg-white/50'
                                                    }`}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Description formatée */}
                        {event.description && (
                            <div className="p-5">
                                <div
                                    className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: `<p>${formatDescription(event.description)}</p>` }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Bouton fermer en bas */}
                    <div className="shrink-0 p-4 border-t bg-white">
                        <button
                            onClick={() => setShowDetail(false)}
                            className="w-full py-3 rounded-xl font-medium text-white transition-colors"
                            style={{ backgroundColor: palette.accent }}
                        >
                            Fermer
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

/** Vignette événement à venir — style « player musique » (Mobile) */
function MobileUpcomingEvent({ event }: { event: EventData }) {
    const palette = generateEventPalette(event.color || '#3498DB');
    const hasImage = event.images && event.images.length > 0;

    return (
        <div
            className="flex items-center gap-3 p-3 rounded-xl border shadow-sm"
            style={{ backgroundColor: palette.bg, borderColor: palette.border }}
        >
            {/* Infos (titre, sous-titre, date) */}
            <div className="flex-1 min-w-0">
                <p className="font-bold text-base truncate" style={{ color: palette.text }}>
                    {event.title}
                </p>
                {event.subtitle && (
                    <p className="text-sm truncate" style={{ color: palette.textMuted }}>
                        {event.subtitle}
                    </p>
                )}
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: palette.accent }}>
                    <CalendarClock className="w-3 h-3" />
                    {new Date(event.event_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
            </div>

            {/* Cover image */}
            {hasImage && (
                <div
                    className="w-16 h-16 rounded-lg overflow-hidden shrink-0 shadow border"
                    style={{ borderColor: palette.accent }}
                >
                    <img src={event.images![0].url} alt="" className="w-full h-full object-cover" />
                </div>
            )}
        </div>
    );
}

export function MenuDisplay() {
    const [searchParams] = useSearchParams();
    const forceTvMode = searchParams.get('mode') === 'tv';

    const [isTvMode, setIsTvMode] = useState(forceTvMode);
    const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today');
    const [todayData, setTodayData] = useState<MenuData | null>(null);
    const [tomorrowData, setTomorrowData] = useState<MenuData | null>(null);
    const [todayEvent, setTodayEvent] = useState<EventData | null>(null);
    const [upcomingEvents, setUpcomingEvents] = useState<EventData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [showError, setShowError] = useState(false);
    const [showSkeleton, setShowSkeleton] = useState(false);

    const loadStartRef = useRef<number>(0);
    const requestIdRef = useRef(0);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [categories, setCategories] = useState<MenuCategory[]>(DEFAULT_CATEGORIES);
    const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>(DEFAULT_DIETARY_TAGS);
    const [certifications, setCertifications] = useState<Certification[]>(DEFAULT_CERTIFICATIONS);

    // Footer rotatif TV : liste dynamique de slots
    const [footerSlot, setFooterSlot] = useState(0);

    // Détecter le mode TV par la largeur de l'écran
    useEffect(() => {
        if (forceTvMode) {
            setIsTvMode(true);
            return;
        }

        const checkWidth = () => {
            setIsTvMode(window.innerWidth >= 1920);
        };

        checkWidth();
        window.addEventListener('resize', checkWidth);
        return () => window.removeEventListener('resize', checkWidth);
    }, [forceTvMode]);

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
            const [today, tomorrow, eventsData] = await Promise.all([
                publicApi.getTodayMenu(),
                publicApi.getTomorrowMenu(),
                publicApi.getEvents(isTvMode ? 'tv' : 'mobile')
            ]);

            if (requestId !== requestIdRef.current) {
                return;
            }

            setTodayData(today);
            setTomorrowData(tomorrow);
            setTodayEvent(eventsData?.today_event || null);
            setUpcomingEvents(eventsData?.upcoming_events || []);

            const config = today?.restaurant?.config || tomorrow?.restaurant?.config;
            if (config) {
                if (config.menu_categories?.length) {
                    setCategories(config.menu_categories);
                }
                if (config.dietary_tags?.length) {
                    setDietaryTags(config.dietary_tags);
                }
                if (config.certifications?.length) {
                    setCertifications(config.certifications);
                }
            }
            setError(null);
            setShowError(false);
            clearTimers();
        } catch (err) {
            if (requestId !== requestIdRef.current) {
                return;
            }

            console.error('Erreur chargement:', err);
            setError(err);

            const elapsed = Date.now() - loadStartRef.current;
            const remaining = ERROR_GRACE_PERIOD_MS - elapsed;
            if (remaining <= 0) {
                setShowError(true);
                return;
            }

            if (errorTimerRef.current) {
                clearTimeout(errorTimerRef.current);
            }
            errorTimerRef.current = setTimeout(() => {
                setShowError(true);
            }, remaining);

            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
            }
            retryTimerRef.current = setTimeout(() => {
                attemptLoad(requestId);
            }, Math.min(RETRY_INTERVAL_MS, remaining));
        } finally {
            if (requestId === requestIdRef.current) {
                setIsLoading(false);
            }
        }
    };

    // Charger les données
    const loadData = async () => {
        clearTimers();
        const requestId = ++requestIdRef.current;
        loadStartRef.current = Date.now();
        setIsLoading(true);
        setError(null);
        setShowError(false);
        setShowSkeleton(false);
        if (!isTvMode) {
            skeletonTimerRef.current = setTimeout(() => {
                setShowSkeleton(true);
            }, LOADING_SPINNER_DELAY_MS);
        }
        await attemptLoad(requestId);
    };

    useEffect(() => {
        loadData();

        // Rafraîchir toutes les 5 minutes
        const interval = setInterval(loadData, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [isTvMode]);

    useEffect(() => {
        return () => {
            clearTimers();
        };
    }, []);


    const currentData = selectedDay === 'today' ? todayData : tomorrowData;
    const isPending = isLoading || (Boolean(error) && !showError);

    // Render item badges (tags + certifications)
    const renderItemBadges = (item: MenuItemData) => {
        const badges: JSX.Element[] = [];

        if (item.is_halal) {
            const tag = dietaryTags.find(t => t.id === 'halal');
            if (tag) badges.push(<ItemBadge key="halal" {...tag} />);
        }
        if (item.is_pork_free) {
            const tag = dietaryTags.find(t => t.id === 'pork_free');
            if (tag) badges.push(<ItemBadge key="pork_free" {...tag} />);
        }
        if (item.is_vegetarian) {
            const tag = dietaryTags.find(t => t.id === 'vegetarian');
            if (tag) badges.push(<ItemBadge key="vegetarian" {...tag} />);
        }

        if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach(tagId => {
                if (badges.find(b => b.key === tagId)) return;
                const tag = dietaryTags.find(t => t.id === tagId);
                if (tag) badges.push(<ItemBadge key={tagId} {...tag} />);
            });
        }

        if (item.certifications && Array.isArray(item.certifications)) {
            item.certifications.forEach(certId => {
                const cert = certifications.find(c => c.id === certId);
                if (cert) badges.push(<ItemBadge key={certId} {...cert} />);
            });
        }

        return badges.length > 0 ? <div className="flex flex-wrap gap-1 mt-1">{badges}</div> : null;
    };

    const renderTvBadges = (item: MenuItemData) => {
        const badges: JSX.Element[] = [];

        if (item.is_halal) {
            const tag = dietaryTags.find(t => t.id === 'halal');
            if (tag) badges.push(<div key="halal" className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-100 text-teal-800 border border-teal-200 shadow-sm">
                {renderIcon(tag.icon, 'w-5 h-5')} <span className="text-lg font-medium">{tag.label}</span>
            </div>);
        }
        if (item.is_pork_free) {
            const tag = dietaryTags.find(t => t.id === 'pork_free');
            if (tag) badges.push(<div key="pork_free" className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-800 border border-orange-200 shadow-sm">
                {renderIcon(tag.icon, 'w-5 h-5')} <span className="text-lg font-medium">{tag.label}</span>
            </div>);
        }
        if (item.is_vegetarian) {
            const tag = dietaryTags.find(t => t.id === 'vegetarian');
            if (tag) badges.push(<div key="vegetarian" className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-800 border border-green-200 shadow-sm">
                {renderIcon(tag.icon, 'w-5 h-5')} <span className="text-lg font-medium">{tag.label}</span>
            </div>);
        }

        if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach(tagId => {
                if (badges.find(b => b.key === tagId)) return;
                const tag = dietaryTags.find(t => t.id === tagId);
                if (tag) badges.push(<div key={tagId} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-800 border border-gray-200 shadow-sm">
                    {renderIcon(tag.icon, 'w-5 h-5')} <span className="text-lg font-medium">{tag.label}</span>
                </div>);
            });
        }

        if (item.certifications && Array.isArray(item.certifications)) {
            item.certifications.forEach(certId => {
                const cert = certifications.find(c => c.id === certId);
                if (cert) badges.push(<div key={certId} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200 shadow-sm">
                    {renderIcon(cert.icon, 'w-5 h-5')} <span className="text-lg font-medium">{cert.label}</span>
                </div>);
            });
        }

        return badges.length > 0 ? <div className="flex flex-wrap gap-2 mt-2">{badges}</div> : null;
    };

    // Etats pour la rotation, le zoom et la visibilité des contrôles
    const [isRotated, setIsRotated] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [showControls, setShowControls] = useState(false);


    // Effet de rotation et reset
    useEffect(() => {
        const root = document.documentElement;

        if (isRotated) {
            root.style.transform = 'rotate(-90deg)';
            root.style.transformOrigin = 'center center';
            root.style.width = '100vh';
            root.style.height = '100vw';
            root.style.overflow = 'hidden';
            root.style.position = 'fixed';
            root.style.top = '50%';
            root.style.left = '50%';
            root.style.translate = '-50% -50%';
        } else {
            // Reset des styles
            root.style.transform = '';
            root.style.transformOrigin = '';
            root.style.width = '';
            root.style.height = '';
            root.style.overflow = '';
            root.style.position = '';
            root.style.top = '';
            root.style.left = '';
            root.style.translate = '';
        }

        // Clean
        return () => {
            root.style.transform = '';
            root.style.transformOrigin = '';
            root.style.width = '';
            root.style.height = '';
            root.style.overflow = '';
            root.style.position = '';
            root.style.top = '';
            root.style.left = '';
            root.style.translate = '';
        };
    }, [isRotated]);

    // Cache automatique des contrôles
    useEffect(() => {
        let timeout: any; // Evite conflits NodeJS vs Window

        const onMouseMove = () => {
            setShowControls(true);
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                setShowControls(false);
            }, 3000); // 3 secondes
        };

        // Check initial
        onMouseMove();

        window.addEventListener('mousemove', onMouseMove);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            clearTimeout(timeout);
        };
    }, []);

    // Construire la liste dynamique de slots footer
    const footerSlots: ('event' | 'tomorrow' | 'chefnote')[] = [];
    if (upcomingEvents.length > 0) footerSlots.push('event');
    if (tomorrowData?.menu) footerSlots.push('tomorrow');
    if (todayData?.menu?.chef_note) footerSlots.push('chefnote');
    const footerCount = footerSlots.length;

    // Rotation footer TV toutes les 8 secondes
    useEffect(() => {
        if (footerCount <= 1) return;
        setFooterSlot(0);
        const timer = setInterval(() => {
            setFooterSlot(prev => (prev + 1) % footerCount);
        }, 8000);
        return () => clearInterval(timer);
    }, [footerCount]);

    // Afficher l'erreur (après tous les hooks)
    if (error && showError) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <InlineError
                    type={getErrorType(error)}
                    onRetry={loadData}
                    showLogo={true}
                />
            </div>
        );
    }

    // Mode TV
    if (isTvMode) {
        return (
            <div className="tv-mode min-h-screen bg-gray-50 flex flex-col relative overflow-hidden transition-all duration-500">
                {/* Contrôles (Zoom + Rotation) - Bas Droite et Auto-cachés */}
                <div className={`fixed bottom-6 right-6 z-50 flex flex-col gap-4 transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                    {/* Zoom In */}
                    <button
                        onClick={() => setZoomLevel(prev => Math.min(prev + 0.1, 2.5))}
                        className="bg-black/60 hover:bg-black/80 text-white p-4 rounded-full backdrop-blur-md shadow-xl transition-all hover:scale-110"
                        title="Zoomer (+)"
                    >
                        <ZoomIn className="w-8 h-8" />
                    </button>

                    {/* Zoom Out */}
                    <button
                        onClick={() => setZoomLevel(prev => Math.max(prev - 0.1, 0.5))}
                        className="bg-black/60 hover:bg-black/80 text-white p-4 rounded-full backdrop-blur-md shadow-xl transition-all hover:scale-110"
                        title="Dézoomer (-)"
                    >
                        <ZoomOut className="w-8 h-8" />
                    </button>

                    {/* Rotation */}
                    <button
                        onClick={() => setIsRotated(!isRotated)}
                        className={`
                            p-4 rounded-full backdrop-blur-md shadow-xl transition-all duration-300 hover:scale-110
                            ${isRotated
                                ? 'bg-mariam-blue/80 text-white hover:bg-mariam-blue'
                                : 'bg-black/60 text-white hover:bg-black/80'
                            }
                        `}
                        title={isRotated ? "Rétablir l'affichage horizontal" : "Pivoter l'écran (pour écrans verticaux)"}
                    >
                        <RefreshCw className={`w-8 h-8 transition-transform duration-500 ${isRotated ? 'rotate-90' : ''}`} />
                    </button>
                </div>

                {/* Contenu avec Zoom */}
                <div style={{ zoom: zoomLevel } as any} className="flex flex-col h-full w-full">
                    {/* Header TV */}
                    <header className="px-10 py-8 flex items-center justify-between border-b bg-white shadow-sm shrink-0">
                        <div className="flex items-center gap-8">
                            {todayData?.restaurant?.logo_url && (
                                <img
                                    src={todayData.restaurant.logo_url}
                                    alt=""
                                    className="h-24 w-auto object-contain"
                                />
                            )}
                            <div>
                                <h1 className="text-5xl font-bold text-mariam-blue tracking-tight leading-none">
                                    Menu du jour
                                </h1>
                                <p className="text-3xl text-gray-500 mt-2 font-light">
                                    {todayData?.day_name} {new Date(todayData?.date || '').toLocaleDateString('fr-FR', {
                                        day: 'numeric',
                                        month: 'long'
                                    })}
                                </p>
                            </div>
                        </div>
                        {todayData?.restaurant && (
                            <div className="text-right">
                                <p className="text-4xl text-gray-600 font-light">
                                    {todayData.restaurant.name}
                                </p>
                            </div>
                        )}
                    </header>

                    {/* Bannière événement du jour (TV) */}
                    {todayEvent && (
                        <TvTodayEventBanner event={todayEvent} />
                    )}

                    {/* Contenu principal TV */}
                    <main className="flex-1 p-10 overflow-hidden bg-gray-50/50">
                        {isPending ? (
                            <div className="h-full flex items-center justify-center">
                                <div className="animate-spin rounded-full h-32 w-32 border-b-8 border-mariam-blue"></div>
                            </div>
                        ) : todayData?.menu ? (
                            <div className="h-full flex gap-10">
                                {/* Menu principal - Grille horizontale */}
                                <div className="flex-1 overflow-y-auto pr-6 custom-scrollbar">
                                    <div className="grid grid-cols-[repeat(auto-fit,minmax(450px,1fr))] gap-8 content-start pb-20">
                                        {categories.sort((a, b) => a.order - b.order).map(category => {
                                            const items = getItemsByCategory(todayData.menu, category.id);
                                            if (items.length === 0) return null;

                                            const isVg = category.id === 'vg';
                                            const isPlat = category.id === 'plat';

                                            return (
                                                <section
                                                    key={category.id}
                                                    className={`
                                                    rounded-3xl p-8 shadow-md border 
                                                    flex flex-col gap-6 h-full
                                                    transition-all duration-300
                                                    ${isVg
                                                            ? 'bg-gradient-to-br from-green-50 to-white border-green-200'
                                                            : 'bg-white border-gray-100'}
                                                    ${isPlat ? 'ring-1 ring-mariam-blue/20 shadow-lg' : ''}
                                                `}
                                                >
                                                    {/* Category Header */}
                                                    <h2 className={`flex items-center gap-4 border-b pb-4 ${isVg ? 'border-green-100' : 'border-gray-50'}`}>
                                                        <div className={`p-3 rounded-2xl shadow-sm ${isVg ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {renderIcon(category.icon, 'w-10 h-10')}
                                                        </div>
                                                        <span className={`text-3xl font-bold uppercase tracking-wide ${isVg ? 'text-green-800' : 'text-gray-700'}`}>
                                                            {category.label}
                                                        </span>
                                                    </h2>

                                                    {/* Category Items */}
                                                    <ul className="space-y-6 flex-1">
                                                        {items.map((item, i) => (
                                                            <li key={i} className={`flex flex-col gap-2 ${isVg ? 'text-green-900' : 'text-gray-900'}`}>
                                                                <span className={`leading-tight font-medium ${isPlat ? 'text-5xl tracking-tight' : 'text-4xl'}`}>
                                                                    {item.name}
                                                                </span>
                                                                <div className="origin-left transform scale-100">
                                                                    {renderTvBadges(item)}
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </section>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Sidebar droite — Photos du menu */}
                                {todayData.menu.images && todayData.menu.images.length > 0 && (
                                    <aside className="w-[28rem] shrink-0">
                                        <div className="bg-white rounded-3xl overflow-hidden border border-gray-200 shadow-md">
                                            <div className="aspect-square w-full overflow-hidden">
                                                <TvImageCarousel images={todayData.menu.images} interval={5000} />
                                            </div>
                                        </div>
                                    </aside>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400">
                                <p className="text-5xl font-light">Aucun menu disponible pour aujourd'hui</p>
                            </div>
                        )}
                    </main>

                </div>

                {/* Footer rotatif — alterne entre les contenus disponibles */}
                {footerCount > 0 && (
                    <footer className="fixed bottom-0 left-0 w-full z-40 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] overflow-hidden">
                        <div
                            className="flex transition-transform duration-700 ease-in-out"
                            style={{
                                width: `${footerCount * 100}%`,
                                transform: `translateX(-${footerSlot * (100 / footerCount)}%)`,
                            }}
                        >
                            {footerSlots.map((slot, i) => (
                                <div key={slot + i} style={{ width: `${100 / footerCount}%` }} className="shrink-0">
                                    {slot === 'event' && <TvUpcomingEventFooter event={upcomingEvents[0]} />}
                                    {slot === 'tomorrow' && tomorrowData?.menu && <TvTomorrowFooter menu={tomorrowData.menu} getItems={getItemsByCategory} />}
                                    {slot === 'chefnote' && todayData?.menu?.chef_note && <TvChefNoteFooter note={todayData.menu.chef_note} />}
                                </div>
                            ))}
                        </div>
                    </footer>
                )}
            </div>
        );
    }

    // Mode Mobile
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header Mobile */}
            <header className="bg-mariam-blue text-white p-4 flex items-center relative">
                <div className="flex-1 flex flex-col items-center">
                    <Logo className="h-10 w-auto" variant="light" />
                    <p className="text-center text-blue-200 text-sm mt-1">
                        {currentData?.restaurant?.name || 'Restaurant Universitaire'}
                    </p>
                </div>
                <div className="absolute right-3">
                    <NotificationBell />
                </div>
            </header>

            {/* Toggle Aujourd'hui / Demain */}
            <div className="flex border-b">
                <button
                    onClick={() => setSelectedDay('today')}
                    className={`flex-1 py-3 text-center font-medium transition-colors
                        ${selectedDay === 'today'
                            ? 'text-mariam-blue border-b-2 border-mariam-blue bg-white'
                            : 'text-gray-500 bg-gray-50'
                        }`}
                >
                    Aujourd'hui
                </button>
                <button
                    onClick={() => setSelectedDay('tomorrow')}
                    className={`flex-1 py-3 text-center font-medium transition-colors
                        ${selectedDay === 'tomorrow'
                            ? 'text-mariam-blue border-b-2 border-mariam-blue bg-white'
                            : 'text-gray-500 bg-gray-50'
                        }`}
                >
                    Demain
                </button>
            </div>

            {/* Contenu Mobile */}
            <main className="p-4">
                {isPending ? (
                    showSkeleton ? (
                        <MobileMenuSkeleton />
                    ) : (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mariam-blue"></div>
                        </div>
                    )
                ) : currentData?.menu ? (
                    <div className="space-y-4">
                        {/* Date */}
                        <div className="text-center text-gray-600 text-sm">
                            {currentData.day_name} {new Date(currentData.date).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long'
                            })}
                        </div>

                        {/* Événement du jour — Mobile (avant le menu) */}
                        {todayEvent && selectedDay === 'today' && (
                            <MobileTodayEvent event={todayEvent} />
                        )}

                        {categories.sort((a, b) => a.order - b.order).map(category => {
                            const items = getItemsByCategory(currentData.menu, category.id);
                            if (items.length === 0) return null;

                            const isVg = category.id === 'vg';
                            const isPlat = category.id === 'plat';

                            return (
                                <section
                                    key={category.id}
                                    className={`rounded-lg p-4 shadow-sm ${isVg
                                        ? 'bg-green-50 border-l-4 border-green-500'
                                        : isPlat
                                            ? 'bg-white border-l-4 border-mariam-blue'
                                            : 'bg-white'
                                        }`}
                                >
                                    <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1 ${isVg ? 'text-green-600' : 'text-gray-400'
                                        }`}>
                                        {renderIcon(category.icon, 'w-4 h-4')}
                                        {category.label}
                                    </h2>
                                    <ul className="space-y-2">
                                        {items.map((item, i) => (
                                            <li key={i} className={`${isVg
                                                ? 'text-lg font-medium text-green-800'
                                                : isPlat
                                                    ? 'text-lg font-medium text-gray-900'
                                                    : 'text-gray-700'
                                                }`}>
                                                {item.name}
                                                {renderItemBadges(item)}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-500">
                        <p>Aucun menu disponible pour {selectedDay === 'today' ? "aujourd'hui" : 'demain'}</p>
                    </div>
                )}

                {/* Images du jour — Mobile */}
                {currentData?.menu?.images && currentData.menu.images.length > 0 && (
                    <section className="mt-6">
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" />
                            {currentData.menu.images.length > 1 ? 'Images du jour' : 'Image du jour'}
                        </h2>
                        <MobileImageCarousel images={currentData.menu.images} interval={5000} />
                    </section>
                )}

                {/* Note du chef — Mobile */}
                {currentData?.menu?.chef_note && (
                    <section className="mt-6">
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <ChefHat className="w-4 h-4" />
                            Note du chef
                        </h2>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
                            <p className="text-amber-800 italic leading-relaxed">
                                « {currentData.menu.chef_note} »
                            </p>
                        </div>
                    </section>
                )}

                {/* Événements à venir — Mobile */}
                {upcomingEvents.length > 0 && (
                    <section className="mt-6">
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <CalendarClock className="w-4 h-4" />
                            À venir
                        </h2>
                        <div className="space-y-3">
                            {upcomingEvents.slice(0, 2).map((event) => (
                                <MobileUpcomingEvent key={event.id} event={event} />
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
