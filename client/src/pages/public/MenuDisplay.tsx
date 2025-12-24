/**
 * MARIAM - Affichage public du menu
 * 
 * Mode TV (plein écran) et Mobile (compact).
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicApi, MenuCategory, DietaryTag, Certification } from '@/lib/api';
import { Icon } from '@/components/ui/icon-picker';
import { Leaf, BadgeCheck, Ban, WheatOff, MilkOff, Sprout, MapPin, Flag, Fish, RefreshCw, ZoomIn, ZoomOut, CalendarClock } from 'lucide-react';
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
    title: string;
    description?: string;
    event_date: string;
}

// Configuration par défaut
const DEFAULT_CATEGORIES: MenuCategory[] = [
    { id: 'entree', label: 'Entrée', icon: 'salad', order: 1 },
    { id: 'plat', label: 'Plat principal', icon: 'utensils', order: 2 },
    { id: 'vg', label: 'Option végétarienne', icon: 'leaf', order: 3 },
    { id: 'dessert', label: 'Dessert', icon: 'cake-slice', order: 4 },
];

const DEFAULT_DIETARY_TAGS: DietaryTag[] = [
    { id: 'vegetarian', label: 'Végétarien', icon: 'leaf', color: 'green' },
    { id: 'halal', label: 'Halal', icon: 'badge-check', color: 'teal' },
    { id: 'pork_free', label: 'Sans porc', icon: 'ban', color: 'orange' },
];

const DEFAULT_CERTIFICATIONS: Certification[] = [
    { id: 'bio', label: 'Bio', icon: 'sprout', color: 'green' },
    { id: 'local', label: 'Local', icon: 'map-pin', color: 'blue' },
    { id: 'french_meat', label: 'Viande française', icon: 'flag', color: 'indigo' },
];

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

export function MenuDisplay() {
    const [searchParams] = useSearchParams();
    const forceTvMode = searchParams.get('mode') === 'tv';

    const [isTvMode, setIsTvMode] = useState(forceTvMode);
    const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today');
    const [todayData, setTodayData] = useState<MenuData | null>(null);
    const [tomorrowData, setTomorrowData] = useState<MenuData | null>(null);
    const [events, setEvents] = useState<EventData[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [categories, setCategories] = useState<MenuCategory[]>(DEFAULT_CATEGORIES);
    const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>(DEFAULT_DIETARY_TAGS);
    const [certifications, setCertifications] = useState<Certification[]>(DEFAULT_CERTIFICATIONS);

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

    // Charger les données
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [today, tomorrow, eventsData] = await Promise.all([
                    publicApi.getTodayMenu(),
                    publicApi.getTomorrowMenu(),
                    publicApi.getEvents(isTvMode ? 'tv' : 'mobile')
                ]);

                setTodayData(today);
                setTomorrowData(tomorrow);
                setEvents(eventsData || []);

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
            } catch (error) {
                console.error('Erreur chargement:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();

        // Rafraîchir toutes les 5 minutes
        const interval = setInterval(loadData, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [isTvMode]);

    const currentData = selectedDay === 'today' ? todayData : tomorrowData;

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

                    {/* Contenu principal TV */}
                    <main className="flex-1 p-10 overflow-hidden bg-gray-50/50">
                        {isLoading ? (
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

                                {/* Événements (Sidebar droite fixe) */}
                                {events.length > 0 && (
                                    <aside className="w-[28rem] flex flex-col gap-6 shrink-0">
                                        <div className="bg-white rounded-3xl p-8 flex-1 border border-gray-200 shadow-md">
                                            <h3 className="font-bold text-3xl text-mariam-blue mb-8 flex items-center gap-3">
                                                <span className="bg-mariam-blue/10 text-mariam-blue p-2 rounded-xl">
                                                    <div className="w-8 h-8">📣</div>
                                                </span>
                                                À venir
                                            </h3>
                                            <ul className="space-y-8">
                                                {events.slice(0, 3).map((event, i) => (
                                                    <li key={i} className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                                        <p className="font-bold text-2xl mb-3 text-gray-900">{event.title}</p>
                                                        {event.description && (
                                                            <p className="text-xl text-gray-600 mb-4 leading-normal">
                                                                {event.description}
                                                            </p>
                                                        )}
                                                        <div className="flex items-center gap-3 text-mariam-blue font-medium text-lg bg-blue-50/50 p-3 rounded-xl w-fit">
                                                            <span>📅</span>
                                                            {new Date(event.event_date).toLocaleDateString('fr-FR', {
                                                                weekday: 'long',
                                                                day: 'numeric',
                                                                month: 'long'
                                                            })}
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
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

                {/* Footer - Demain */}
                {tomorrowData?.menu && (
                    <footer className="fixed bottom-0 left-0 w-full bg-gray-100/95 backdrop-blur-md text-gray-800 px-10 py-6 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-40 flex items-center gap-6 border-t border-gray-200">
                        <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                            <CalendarClock className="w-8 h-8 text-mariam-blue" />
                        </div>
                        <div className="flex items-baseline gap-4">
                            <span className="text-gray-500 text-2xl uppercase tracking-wider font-bold">Demain :</span>
                            <span className="text-4xl font-bold text-mariam-blue tracking-tight">
                                {getItemsByCategory(tomorrowData.menu, 'plat')[0]?.name || 'Menu surprise'}
                            </span>
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
            <header className="bg-mariam-blue text-white p-4">
                <h1 className="text-2xl font-bold text-center">MARIAM</h1>
                <p className="text-center text-blue-200 text-sm">
                    {currentData?.restaurant?.name || 'Restaurant Universitaire'}
                </p>
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
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mariam-blue"></div>
                    </div>
                ) : currentData?.menu ? (
                    <div className="space-y-4">
                        {/* Date */}
                        <div className="text-center text-gray-600 text-sm">
                            {currentData.day_name} {new Date(currentData.date).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long'
                            })}
                        </div>

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

                {/* Événements Mobile */}
                {events.length > 0 && (
                    <section className="mt-8">
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                            À venir
                        </h2>
                        <div className="space-y-3">
                            {events.slice(0, 2).map((event, i) => (
                                <div key={i} className="bg-blue-50 rounded-lg p-3">
                                    <p className="font-medium text-mariam-blue">{event.title}</p>
                                    {event.description && (
                                        <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                                    )}
                                    <p className="text-xs text-gray-400 mt-1">
                                        {new Date(event.event_date).toLocaleDateString('fr-FR', {
                                            weekday: 'long',
                                            day: 'numeric',
                                            month: 'long'
                                        })}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
