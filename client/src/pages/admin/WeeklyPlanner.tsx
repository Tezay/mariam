/**
 * MARIAM - Weekly Planner (Dashboard Admin)
 * 
 * Vue hebdomadaire des menus avec :
 * - Grille 7 jours sur desktop
 * - Navigation jour par jour sur mobile
 * - Badge de statut par jour (Publié/Brouillon/Vide)
 * - Navigation semaine précédente/suivante
 * - Publication de toute la semaine
 */
import { useState, useEffect } from 'react';
import { menusApi, Menu, adminApi, MenuCategory } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MenuEditor } from '@/components/MenuEditor';
import { Icon } from '@/components/ui/icon-picker';
import type { IconName } from '@/components/ui/icon-picker';
import { ChevronLeft, ChevronRight, Check, FileEdit, FileX, Send } from 'lucide-react';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// Configuration par défaut
const DEFAULT_CATEGORIES: MenuCategory[] = [
    { id: 'entree', label: 'Entrée', icon: 'salad', order: 1 },
    { id: 'plat', label: 'Plat principal', icon: 'utensils', order: 2 },
    { id: 'vg', label: 'Option végétarienne', icon: 'leaf', order: 3 },
    { id: 'dessert', label: 'Dessert', icon: 'cake-slice', order: 4 },
];

interface WeekData {
    week_start: string;
    week_end: string;
    restaurant_id: number;
    service_days: number[];  // 0=Mon, 6=Sun
    menus: Record<string, Menu | null>;
}

interface MenuItem {
    name: string;
    category: string;
    tags?: string[];
    certifications?: string[];
}

export function WeeklyPlanner() {
    const { user } = useAuth();
    const [weekOffset, setWeekOffset] = useState(0);
    const [weekData, setWeekData] = useState<WeekData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [isPublishing, setIsPublishing] = useState(false);
    const [categories, setCategories] = useState<MenuCategory[]>(DEFAULT_CATEGORIES);

    // Mobile : suivre l'index du jour actuel pour le carousel
    const [mobileIndex, setMobileIndex] = useState(0);

    // Vérifier si l'utilisateur peut éditer (admin ou editor)
    const canEdit = user?.role === 'admin' || user?.role === 'editor';

    // Charger la configuration du restaurant pour les catégories
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const settings = await adminApi.getSettings();
                if (settings.config?.menu_categories?.length) {
                    setCategories(settings.config.menu_categories);
                }
            } catch (error) {
                console.error('Erreur chargement config:', error);
            }
        };
        loadConfig();
    }, []);

    // Charger les menus de la semaine
    const loadWeek = async () => {
        setIsLoading(true);
        try {
            const data = await menusApi.getWeek(weekOffset);
            setWeekData(data);
        } catch (error) {
            console.error('Erreur chargement semaine:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadWeek();
        setMobileIndex(0); // Reset index mobile si semaine change
    }, [weekOffset]);

    // Publier toute la semaine
    const handlePublishWeek = async () => {
        if (!weekData) return;

        setIsPublishing(true);
        try {
            await menusApi.publishWeek(weekOffset, weekData.restaurant_id);
            await loadWeek();
        } catch (error) {
            console.error('Erreur publication:', error);
        } finally {
            setIsPublishing(false);
        }
    };

    // Calculer les dates de la semaine (filtrées par jours de service)
    const getWeekDates = (): { dateStr: string; dayIndex: number }[] => {
        if (!weekData?.week_start) return [];

        const dates: { dateStr: string; dayIndex: number }[] = [];
        const start = new Date(weekData.week_start);
        const serviceDays = weekData.service_days || [0, 1, 2, 3, 4]; // Par défaut : Mon-Fri

        for (let i = 0; i < 7; i++) {
            // Seulement les jours de service configurés
            if (serviceDays.includes(i)) {
                const date = new Date(start);
                date.setDate(start.getDate() + i);
                dates.push({
                    dateStr: date.toISOString().split('T')[0],
                    dayIndex: i
                });
            }
        }

        return dates;
    };

    const weekDates = getWeekDates();

    // Formater la date pour affichage
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    };

    // Formater le numéro de semaine
    const getWeekNumber = () => {
        if (!weekData?.week_start) return '';
        const date = new Date(weekData.week_start);
        const start = new Date(date.getFullYear(), 0, 1);
        const diff = date.getTime() - start.getTime();
        const oneWeek = 1000 * 60 * 60 * 24 * 7;
        return Math.ceil(diff / oneWeek);
    };

    // Compter les menus par statut
    const countByStatus = () => {
        if (!weekData?.menus) return { published: 0, draft: 0, empty: 0 };

        let published = 0, draft = 0, empty = 0;
        Object.values(weekData.menus).forEach(menu => {
            if (!menu) empty++;
            else if (menu.status === 'published') published++;
            else draft++;
        });

        return { published, draft, empty };
    };

    const statusCount = countByStatus();

    // Récupérer les items pour une catégorie depuis le menu
    const getItemsByCategory = (menu: Menu | null, categoryId: string): MenuItem[] => {
        if (!menu?.items) return [];
        return menu.items.filter((item: MenuItem) => item.category === categoryId);
    };

    // Afficher le badge de statut
    const renderStatusBadge = (menu: Menu | null) => {
        if (!menu) {
            return (
                <Badge variant="outline" className="gap-1 text-gray-500 border-gray-300">
                    <FileX className="w-3 h-3" /> Vide
                </Badge>
            );
        }
        if (menu.status === 'published') {
            return (
                <Badge className="gap-1 bg-green-100 text-green-700 hover:bg-green-100">
                    <Check className="w-3 h-3" /> Publié
                </Badge>
            );
        }
        return (
            <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100">
                <FileEdit className="w-3 h-3" /> Brouillon
            </Badge>
        );
    };

    // Afficher le contenu d'une carte de jour
    const renderDayCard = (dateStr: string, dayIndex: number) => {
        const menu = weekData?.menus[dateStr];
        const isToday = dateStr === new Date().toISOString().split('T')[0];
        const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

        return (
            <Card
                className={`
                    h-full flex flex-col transition-all
                    ${canEdit ? 'cursor-pointer hover:shadow-lg hover:border-mariam-blue/50' : ''}
                    ${isToday ? 'ring-2 ring-mariam-blue ring-offset-2' : ''}
                `}
                onClick={() => canEdit && setSelectedDate(dateStr)}
            >
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className={`text-lg ${isToday ? 'text-mariam-blue' : ''}`}>
                                {DAY_NAMES[dayIndex]}
                            </CardTitle>
                            <p className="text-sm text-gray-500">{formatDate(dateStr)}</p>
                        </div>
                        {renderStatusBadge(menu || null)}
                    </div>
                </CardHeader>
                <CardContent className="flex-1 pt-2">
                    {menu && menu.items && menu.items.length > 0 ? (
                        <div className="space-y-3">
                            {sortedCategories.map(category => {
                                const items = getItemsByCategory(menu, category.id);
                                if (items.length === 0) return null;

                                const isVg = category.id === 'vg';

                                return (
                                    <div key={category.id}>
                                        <div className={`text-xs font-semibold uppercase tracking-wide mb-1 flex items-center gap-1 ${isVg ? 'text-green-600' : 'text-gray-400'}`}>
                                            <Icon name={category.icon as IconName} className="w-3 h-3" />
                                            {category.label}
                                        </div>
                                        <ul className="space-y-0.5">
                                            {items.map((item, idx) => (
                                                <li
                                                    key={idx}
                                                    className={`text-sm ${isVg ? 'text-green-700' : category.id === 'plat' ? 'font-medium text-gray-900' : 'text-gray-700'}`}
                                                >
                                                    {item.name}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full min-h-[100px] text-gray-400">
                            <FileX className="w-8 h-8 mb-2 opacity-50" />
                            <span className="text-sm">
                                {canEdit ? 'Cliquez pour ajouter' : 'Aucun menu'}
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    // Navigation mobile
    const goToPrevDay = () => {
        setMobileIndex(i => Math.max(0, i - 1));
    };

    const goToNextDay = () => {
        setMobileIndex(i => Math.min(weekDates.length - 1, i + 1));
    };

    return (
        <div className="container-mariam py-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Gestion des menus
                    </h1>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <p className="text-gray-600">
                            Semaine {getWeekNumber()} — {weekData?.week_start && formatDate(weekData.week_start)} au {weekData?.week_end && formatDate(weekData.week_end)}
                        </p>
                        {/* Navigation semaine (desktop only) */}
                        <div className="hidden md:flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setWeekOffset(w => w - 1)}
                                className="h-7 px-2"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setWeekOffset(0)}
                                disabled={weekOffset === 0}
                                className="h-7 px-2 text-xs"
                            >
                                Actuelle
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setWeekOffset(w => w + 1)}
                                className="h-7 px-2"
                            >
                                <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Statistiques */}
                    <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            <Check className="w-3 h-3 mr-1" /> {statusCount.published}
                        </Badge>
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            <FileEdit className="w-3 h-3 mr-1" /> {statusCount.draft}
                        </Badge>
                        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
                            <FileX className="w-3 h-3 mr-1" /> {statusCount.empty}
                        </Badge>
                    </div>

                    {/* Bouton publier */}
                    {statusCount.draft > 0 && canEdit && (
                        <Button
                            onClick={handlePublishWeek}
                            disabled={isPublishing}
                            className="gap-2"
                        >
                            <Send className="w-4 h-4" />
                            {isPublishing ? 'Publication...' : 'Publier la semaine'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Navigation semaine (mobile only) */}
            <div className="flex md:hidden items-center justify-center gap-2 mb-6">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWeekOffset(w => w - 1)}
                    className="gap-1"
                >
                    <ChevronLeft className="w-4 h-4" /> Précédente
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWeekOffset(0)}
                    disabled={weekOffset === 0}
                >
                    Cette semaine
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWeekOffset(w => w + 1)}
                    className="gap-1"
                >
                    Suivante <ChevronRight className="w-4 h-4" />
                </Button>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-mariam-blue"></div>
                </div>
            ) : (
                <>
                    {/* Desktop: Grille de semaine avec wrapping */}
                    <div className="hidden md:grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
                        {weekDates.map(({ dateStr, dayIndex }) => (
                            <div key={dateStr} className="min-h-[400px]">
                                {renderDayCard(dateStr, dayIndex)}
                            </div>
                        ))}
                    </div>

                    {/* Mobile : Carousel de jour */}
                    <div className="md:hidden">
                        {/* Pills de sélection des jours */}
                        <div className="flex gap-1 overflow-x-auto pb-3 mb-4 scrollbar-hide">
                            {weekDates.map(({ dateStr, dayIndex }, idx) => {
                                const menu = weekData?.menus[dateStr];
                                const isToday = dateStr === new Date().toISOString().split('T')[0];
                                const isActive = idx === mobileIndex;

                                return (
                                    <button
                                        key={dateStr}
                                        onClick={() => setMobileIndex(idx)}
                                        className={`
                                            flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-all
                                            ${isActive
                                                ? 'bg-mariam-blue text-white'
                                                : isToday
                                                    ? 'bg-blue-100 text-mariam-blue'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }
                                        `}
                                    >
                                        <div>{DAY_NAMES[dayIndex].slice(0, 3)}</div>
                                        <div className="text-xs opacity-80">{formatDate(dateStr)}</div>
                                        {menu && (
                                            <div className={`h-1.5 w-1.5 rounded-full mx-auto mt-1 ${menu.status === 'published' ? 'bg-green-400' : 'bg-amber-400'}`} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Carte du jour actif */}
                        {weekDates[mobileIndex] && (
                            <div className="min-h-[350px]">
                                {renderDayCard(weekDates[mobileIndex].dateStr, weekDates[mobileIndex].dayIndex)}
                            </div>
                        )}

                        {/* Navigation mobile */}
                        <div className="flex justify-between mt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={goToPrevDay}
                                disabled={mobileIndex === 0}
                                className="gap-1"
                            >
                                <ChevronLeft className="w-4 h-4" /> {mobileIndex > 0 && DAY_NAMES[weekDates[mobileIndex - 1]?.dayIndex]?.slice(0, 3)}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={goToNextDay}
                                disabled={mobileIndex === weekDates.length - 1}
                                className="gap-1"
                            >
                                {mobileIndex < weekDates.length - 1 && DAY_NAMES[weekDates[mobileIndex + 1]?.dayIndex]?.slice(0, 3)} <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {/* Drawer d'édition (only for editors/admins) */}
            {selectedDate && weekData && canEdit && (
                <MenuEditor
                    date={selectedDate}
                    restaurantId={weekData.restaurant_id}
                    menu={weekData.menus[selectedDate]}
                    onClose={() => setSelectedDate(null)}
                    onSave={async () => {
                        await loadWeek();
                        setSelectedDate(null);
                    }}
                />
            )}
        </div>
    );
}
