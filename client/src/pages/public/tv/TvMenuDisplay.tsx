/**
 * MARIAM - Affichage public du menu — Mode TV (>= 1920px)
 *
 * Optimisé pour grands écrans (salles à manger, cafétérias).
 */
import { useState, useEffect, useRef } from 'react';
import { menusApi, eventsApi, closuresApi, ExceptionalClosure, DietaryTag, CertificationItem } from '@/lib/api';
import { generateEventPalette } from '@/lib/color-utils';
import { Icon } from '@/components/ui/icon-picker';
import { InlineError, getErrorType } from '@/components/InlineError';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
    RefreshCw, ZoomIn, ZoomOut, CalendarClock,
    Megaphone, Calendar, ChefHat, CalendarOff,
} from 'lucide-react';
import type { MenuItemData, DisplayCategory, MenuResponse, MenuData, EventData } from '../menu-types';
import type { IconName } from '@/components/ui/icon-picker';

const ERROR_GRACE_PERIOD_MS = 20000;
const RETRY_INTERVAL_MS = 500;

// ─── Constantes badges ──────────────────────────────────────────────────────

const TAG_CATEGORY_NAMES: Record<string, string> = {
    regime: 'Régime alimentaire',
    allergenes: 'Allergènes',
    preparation: 'Mode de préparation',
    gout: 'Goût',
};

const JURISDICTION_LABELS: Record<string, string> = {
    france: '🇫🇷 France',
    eu: '🇪🇺 Union européenne',
    international: '🌍 International',
};

const SCHEME_LABELS: Record<string, string> = {
    public: 'Label officiel',
    private: 'Label privé',
};

// ─── CertBadge (TV) ────────────────────────────────────────────────────────

function CertBadge({ cert, size = 'sm' }: { cert: CertificationItem; size?: 'sm' | 'lg' }) {
    const sizeClass = size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button type="button" className="inline-flex items-center">
                    <img
                        src={`/certifications/${cert.logo_filename}`}
                        alt={cert.name}
                        title={cert.name}
                        className={`${sizeClass} object-contain cursor-pointer`}
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
                <div className="flex items-start gap-3 mb-2">
                    <img src={`/certifications/${cert.logo_filename}`} alt={cert.name} className="h-10 w-10 object-contain shrink-0" />
                    <div>
                        <p className="font-semibold text-sm leading-tight">{cert.name}</p>
                        {cert.official_name && cert.official_name !== cert.name && (
                            <p className="text-xs text-muted-foreground mt-0.5">{cert.official_name}</p>
                        )}
                    </div>
                </div>
                {cert.guarantee && (
                    <p className="text-xs text-gray-600 mb-2 leading-snug">{cert.guarantee}</p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground border-t pt-2 mt-1">
                    {cert.issuer && <span>{cert.issuer}</span>}
                    <span>{JURISDICTION_LABELS[cert.jurisdiction]}</span>
                    <span>{SCHEME_LABELS[cert.scheme_type]}</span>
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ─── Composants TV Images ───────────────────────────────────────────────────

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

// ─── Composants Événements TV ───────────────────────────────────────────────

function TvTodayEventBanner({ event }: { event: EventData }) {
    const palette = generateEventPalette(event.color || '#3498DB');
    const hasImages = event.images && event.images.length > 0;

    return (
        <div
            className="w-full px-10 py-8 flex items-center gap-10 border-b shadow-sm shrink-0 relative overflow-hidden"
            style={{ backgroundColor: palette.bg, borderColor: palette.border }}
        >
            {hasImages && (
                <div className="w-48 h-48 rounded-2xl overflow-hidden shrink-0 shadow-lg border-2" style={{ borderColor: palette.accent }}>
                    <TvImageCarousel images={event.images!} interval={4000} />
                </div>
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 mb-3">
                    <span
                        className="text-lg font-bold uppercase tracking-widest px-4 py-1.5 rounded-xl"
                        style={{ backgroundColor: palette.button, color: palette.buttonText }}
                    >
                        <Megaphone className="w-5 h-5 inline mr-1" /> Aujourd'hui
                    </span>
                </div>
                <h2 className="text-5xl font-extrabold leading-tight mb-2 truncate" style={{ color: palette.text }}>
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

function TvUpcomingEventFooter({ event }: { event: EventData }) {
    const palette = generateEventPalette(event.color || '#3498DB');
    const hasImage = event.images && event.images.length > 0;

    return (
        <div className="w-full px-10 py-4 flex items-center gap-8 border-t" style={{ backgroundColor: palette.bg, borderColor: palette.border }}>
            {hasImage ? (
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 shadow border" style={{ borderColor: palette.accent }}>
                    <img src={event.images![0].url} alt="" className="w-full h-full object-cover" />
                </div>
            ) : (
                <div className="w-14 h-14 rounded-xl shrink-0 shadow border flex items-center justify-center" style={{ borderColor: palette.accent, backgroundColor: palette.card }}>
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
                    <Calendar className="w-5 h-5" />{' '}
                    {new Date(event.event_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
            </div>
        </div>
    );
}

function TvTomorrowFooter({ menu }: { menu: MenuResponse }) {
    const firstItem = menu.by_category?.flatMap(cat =>
        cat.subcategories
            ? cat.subcategories.flatMap(sub => sub.items || [])
            : (cat.items || [])
    )[0];

    return (
        <div className="w-full bg-gray-100/95 backdrop-blur-md text-gray-800 px-10 py-4 flex items-center gap-6 border-t border-gray-200">
            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                <CalendarClock className="w-8 h-8 text-mariam-blue" />
            </div>
            <div className="flex items-baseline gap-4">
                <span className="text-gray-500 text-2xl uppercase tracking-wider font-bold">Demain :</span>
                <span className="text-4xl font-bold text-mariam-blue tracking-tight">
                    {firstItem?.name || 'Menu surprise'}
                </span>
            </div>
        </div>
    );
}

function TvChefNoteFooter({ note }: { note: string }) {
    return (
        <div className="w-full bg-amber-50/95 backdrop-blur-md text-gray-800 px-10 py-4 flex items-center gap-6 border-t border-amber-200">
            <div className="bg-white p-3 rounded-xl shadow-sm border border-amber-100">
                <ChefHat className="w-8 h-8 text-amber-600" />
            </div>
            <p className="text-3xl font-bold text-amber-700">Note du chef :</p>
            <p className="text-3xl text-gray-700 italic leading-snug truncate">« {note} »</p>
        </div>
    );
}

// ─── TvCategoryCard ─────────────────────────────────────────────────────────

function TvCategoryCard({
    category,
    items,
    renderBadges,
}: {
    category: DisplayCategory;
    items: MenuItemData[];
    renderBadges: (item: MenuItemData) => React.ReactNode;
}) {
    const isHighlighted = category.is_highlighted;
    return (
        <section className={`rounded-3xl p-8 shadow-md border flex flex-col gap-6 h-full transition-all duration-300 ${
            isHighlighted ? 'ring-2 ring-mariam-blue/30 shadow-lg bg-white border-gray-100' : 'bg-white border-gray-100'
        }`}>
            <h2 className="flex items-center gap-4 border-b border-gray-50 pb-4">
                <div className="p-3 rounded-2xl shadow-sm bg-gray-100 text-gray-600">
                    <Icon name={category.icon as IconName} className="w-10 h-10" />
                </div>
                <span className="text-3xl font-bold uppercase tracking-wide text-gray-700">
                    {category.label}
                </span>
            </h2>
            <ul className="space-y-6 flex-1">
                {items.map((item, i) => (
                    <li key={i} className="flex flex-col gap-2 text-gray-900">
                        <span className={`leading-tight font-medium ${isHighlighted ? 'text-5xl tracking-tight' : 'text-4xl'} ${item.is_out_of_stock ? 'line-through text-gray-400' : ''}`}>
                            {item.name}
                        </span>
                        {item.is_out_of_stock && item.replacement_label && (
                            <span className="text-2xl text-amber-600 font-medium">→ {item.replacement_label}</span>
                        )}
                        {item.is_out_of_stock && !item.replacement_label && (
                            <span className="text-xl text-amber-500 font-normal">Rupture de service</span>
                        )}
                        {!item.is_out_of_stock && isHighlighted && item.images && item.images.length > 0 && (
                            <img src={item.images[0].url} alt={item.name} className="w-full h-48 object-cover rounded-2xl mt-2" />
                        )}
                        <div className="origin-left">{renderBadges(item)}</div>
                    </li>
                ))}
            </ul>
        </section>
    );
}

// ─── TvClosureDisplay ───────────────────────────────────────────────────────

function TvClosureDisplay({ closure }: { closure: ExceptionalClosure }) {
    const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const dateLabel = closure.start_date === closure.end_date
        ? fmt(closure.start_date)
        : `Du ${fmt(closure.start_date)} au ${fmt(closure.end_date)}`;

    return (
        <div className="h-full flex flex-col items-center justify-center gap-10 text-center px-20">
            <div className="w-32 h-32 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <CalendarOff className="w-16 h-16 text-red-400" />
            </div>
            <div className="space-y-4">
                <p className="text-7xl font-bold text-gray-800 leading-tight">
                    {closure.reason ?? 'Fermeture exceptionnelle'}
                </p>
                <p className="text-4xl text-gray-400 font-light">{dateLabel}</p>
            </div>
            {closure.description && (
                <p className="text-3xl text-gray-500 font-light leading-relaxed max-w-4xl whitespace-pre-line border-t border-gray-200 pt-8">
                    {closure.description}
                </p>
            )}
        </div>
    );
}

// ─── TvMenuDisplay ──────────────────────────────────────────────────────────

export function TvMenuDisplay() {
    const [todayData, setTodayData] = useState<MenuData | null>(null);
    const [tomorrowData, setTomorrowData] = useState<MenuData | null>(null);
    const [todayEvent, setTodayEvent] = useState<EventData | null>(null);
    const [upcomingEvents, setUpcomingEvents] = useState<EventData[]>([]);
    const [activeClosure, setActiveClosure] = useState<ExceptionalClosure | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [showError, setShowError] = useState(false);
    const [footerSlot, setFooterSlot] = useState(0);
    const [isRotated, setIsRotated] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [showControls, setShowControls] = useState(false);
    const [, setDietaryTags] = useState<DietaryTag[]>([]);
    const [, setCertifications] = useState<CertificationItem[]>([]);

    const loadStartRef = useRef<number>(0);
    const requestIdRef = useRef(0);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimers = () => {
        if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); errorTimerRef.current = null; }
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    };

    const attemptLoad = async (requestId: number) => {
        setIsLoading(true);
        try {
            const [today, tomorrow, eventsData, closuresData] = await Promise.all([
                menusApi.getToday(),
                menusApi.getTomorrow(),
                eventsApi.getPublic('tv'),
                closuresApi.getPublic(),
            ]);
            if (requestId !== requestIdRef.current) return;
            setTodayData(today);
            setTomorrowData(tomorrow);
            setTodayEvent(eventsData?.today_event || null);
            setUpcomingEvents(eventsData?.upcoming_events || []);
            setActiveClosure(closuresData?.current_closure || null);
            const config = today?.restaurant?.config || tomorrow?.restaurant?.config;
            if (config) {
                if (config.dietary_tags?.length) setDietaryTags(config.dietary_tags);
                if (config.certifications?.length) setCertifications(config.certifications);
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

    const loadData = async () => {
        clearTimers();
        const requestId = ++requestIdRef.current;
        loadStartRef.current = Date.now();
        setIsLoading(true);
        setError(null);
        setShowError(false);
        await attemptLoad(requestId);
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => () => clearTimers(), []);

    // Rotation écran
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

    // Auto-cache contrôles
    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout>;
        const onMouseMove = () => {
            setShowControls(true);
            clearTimeout(timeout);
            timeout = setTimeout(() => setShowControls(false), 3000);
        };
        onMouseMove();
        window.addEventListener('mousemove', onMouseMove);
        return () => { window.removeEventListener('mousemove', onMouseMove); clearTimeout(timeout); };
    }, []);

    // Footer rotatif
    const footerSlots: ('event' | 'tomorrow' | 'chefnote')[] = [];
    if (upcomingEvents.length > 0) footerSlots.push('event');
    if (tomorrowData?.menu) footerSlots.push('tomorrow');
    if (todayData?.menu?.chef_note) footerSlots.push('chefnote');
    const footerCount = footerSlots.length;

    useEffect(() => {
        if (footerCount <= 1) return;
        setFooterSlot(0);
        const timer = setInterval(() => setFooterSlot(prev => (prev + 1) % footerCount), 8000);
        return () => clearInterval(timer);
    }, [footerCount]);

    const isPending = isLoading || (Boolean(error) && !showError);

    const tvColorClasses: Record<string, string> = {
        green: 'bg-green-100 text-green-800 border-green-200',
        teal: 'bg-teal-100 text-teal-800 border-teal-200',
        orange: 'bg-orange-100 text-orange-800 border-orange-200',
        blue: 'bg-blue-100 text-blue-800 border-blue-200',
        indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        amber: 'bg-amber-100 text-amber-800 border-amber-200',
        cyan: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    };

    const renderTvBadges = (item: MenuItemData) => {
        const badges: JSX.Element[] = [];
        if (item.tags) {
            item.tags.forEach(tag => {
                const cls = tvColorClasses[tag.color] || 'bg-gray-100 text-gray-800 border-gray-200';
                badges.push(
                    <Popover key={tag.id}>
                        <PopoverTrigger asChild>
                            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border shadow-sm cursor-pointer ${cls}`}>
                                <Icon name={tag.icon as IconName} className="w-5 h-5" />
                                <span className="text-lg font-medium">{tag.label}</span>
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-52 p-3" align="start">
                            <div className="flex items-center gap-2 mb-1">
                                <Icon name={tag.icon as IconName} className="w-4 h-4 shrink-0" />
                                <span className="font-semibold text-sm">{tag.label}</span>
                            </div>
                            {TAG_CATEGORY_NAMES[tag.category_id] && (
                                <p className="text-xs text-muted-foreground">{TAG_CATEGORY_NAMES[tag.category_id]}</p>
                            )}
                        </PopoverContent>
                    </Popover>
                );
            });
        }
        if (item.certifications) {
            item.certifications.forEach(cert => badges.push(<CertBadge key={cert.id} cert={cert} size="lg" />));
        }
        return badges.length > 0 ? <div className="flex flex-wrap items-center gap-2 mt-2">{badges}</div> : null;
    };

    if (error && showError) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <InlineError type={getErrorType(error)} onRetry={loadData} showLogo={true} />
            </div>
        );
    }

    return (
        <div className="tv-mode min-h-screen bg-gray-50 flex flex-col relative overflow-hidden transition-all duration-500">
            {/* Contrôles Zoom + Rotation */}
            <div className={`fixed bottom-6 right-6 z-50 flex flex-col gap-4 transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <button onClick={() => setZoomLevel(prev => Math.min(prev + 0.1, 2.5))} className="bg-black/60 hover:bg-black/80 text-white p-4 rounded-full backdrop-blur-md shadow-xl transition-all hover:scale-110" title="Zoomer (+)">
                    <ZoomIn className="w-8 h-8" />
                </button>
                <button onClick={() => setZoomLevel(prev => Math.max(prev - 0.1, 0.5))} className="bg-black/60 hover:bg-black/80 text-white p-4 rounded-full backdrop-blur-md shadow-xl transition-all hover:scale-110" title="Dézoomer (-)">
                    <ZoomOut className="w-8 h-8" />
                </button>
                <button
                    onClick={() => setIsRotated(!isRotated)}
                    className={`p-4 rounded-full backdrop-blur-md shadow-xl transition-all duration-300 hover:scale-110 ${isRotated ? 'bg-mariam-blue/80 text-white hover:bg-mariam-blue' : 'bg-black/60 text-white hover:bg-black/80'}`}
                    title={isRotated ? "Rétablir l'affichage horizontal" : 'Pivoter l\'écran'}
                >
                    <RefreshCw className={`w-8 h-8 transition-transform duration-500 ${isRotated ? 'rotate-90' : ''}`} />
                </button>
            </div>

            {/* Contenu avec Zoom */}
            <div style={{ zoom: zoomLevel } as React.CSSProperties} className="flex flex-col h-full w-full">
                {/* Header TV */}
                <header className="px-10 py-8 flex items-center justify-between border-b bg-white shadow-sm shrink-0">
                    <div className="flex items-center gap-8">
                        {todayData?.restaurant?.logo_url && (
                            <img src={todayData.restaurant.logo_url} alt="" className="h-24 w-auto object-contain" />
                        )}
                        <div>
                            <h1 className="text-5xl font-bold text-mariam-blue tracking-tight leading-none">Menu du jour</h1>
                            <p className="text-3xl text-gray-500 mt-2 font-light">
                                {todayData?.day_name}{' '}
                                {new Date(todayData?.date || '').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                            </p>
                        </div>
                    </div>
                    {todayData?.restaurant && (
                        <div className="text-right">
                            <p className="text-4xl text-gray-600 font-light">{todayData.restaurant.name}</p>
                        </div>
                    )}
                </header>

                {/* Bannière événement du jour */}
                {!activeClosure && todayEvent && <TvTodayEventBanner event={todayEvent} />}

                {/* Contenu principal */}
                <main className="flex-1 p-10 overflow-hidden bg-gray-50/50">
                    {isPending ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="animate-spin rounded-full h-32 w-32 border-b-8 border-mariam-blue" />
                        </div>
                    ) : activeClosure ? (
                        <TvClosureDisplay closure={activeClosure} />
                    ) : todayData?.menu ? (
                        <div className="h-full flex gap-10">
                            <div className="flex-1 overflow-y-auto pr-6 custom-scrollbar">
                                <div className="grid grid-cols-[repeat(auto-fit,minmax(450px,1fr))] gap-8 content-start pb-20">
                                    {(todayData.menu.by_category || []).map(category => {
                                        if (category.subcategories && category.subcategories.length > 0) {
                                            return category.subcategories.map(sub => {
                                                const items = sub.items || [];
                                                if (items.length === 0) return null;
                                                return <TvCategoryCard key={sub.id} category={sub} items={items} renderBadges={renderTvBadges} />;
                                            });
                                        }
                                        const items = category.items || [];
                                        if (items.length === 0) return null;
                                        return <TvCategoryCard key={category.id} category={category} items={items} renderBadges={renderTvBadges} />;
                                    })}
                                </div>
                            </div>
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

            {/* Footer rotatif */}
            {footerCount > 0 && (
                <footer className="fixed bottom-0 left-0 w-full z-40 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] overflow-hidden">
                    <div
                        className="flex transition-transform duration-700 ease-in-out"
                        style={{ width: `${footerCount * 100}%`, transform: `translateX(-${footerSlot * (100 / footerCount)}%)` }}
                    >
                        {footerSlots.map((slot, i) => (
                            <div key={slot + i} style={{ width: `${100 / footerCount}%` }} className="shrink-0">
                                {slot === 'event' && <TvUpcomingEventFooter event={upcomingEvents[0]} />}
                                {slot === 'tomorrow' && tomorrowData?.menu && <TvTomorrowFooter menu={tomorrowData.menu} />}
                                {slot === 'chefnote' && todayData?.menu?.chef_note && <TvChefNoteFooter note={todayData.menu.chef_note} />}
                            </div>
                        ))}
                    </div>
                </footer>
            )}
        </div>
    );
}
