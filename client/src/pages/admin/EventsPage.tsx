/**
 * MARIAM - Page de gestion des événements (Admin)
 *
 * Vue liste avec :
 * - Filtres : à venir / passés / tous
 * - Grille de cartes d'événements avec couleur d'accent
 * - Statuts : Brouillon / Publié (comme les menus)
 * - Actions : modifier, dupliquer, publier/dépublier, supprimer
 * - Création via dialog EventEditor
 */
import { useState, useEffect, useCallback } from 'react';
import { eventsApi, Event } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { generateEventPalette } from '@/lib/color-utils';
import { EventEditor } from '@/components/EventEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InlineError, getErrorType } from '@/components/InlineError';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Plus,
    MoreVertical,
    Pencil,
    Copy,
    Trash2,
    Send,
    FileEdit,
    Check,
    Calendar,
    Image as ImageIcon,
    Megaphone,
} from 'lucide-react';

type FilterMode = 'upcoming' | 'past' | 'all';

export function EventsPage() {
    const { user } = useAuth();
    const canEdit = user?.role === 'admin' || user?.role === 'editor';

    const [events, setEvents] = useState<Event[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [filter, setFilter] = useState<FilterMode>('upcoming');

    // Editor state
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [storageConfigured, setStorageConfigured] = useState(false);

    // Confirm delete
    const [deletingId, setDeletingId] = useState<number | null>(null);

    // ------------------------------------------------------------------
    // Chargement
    // ------------------------------------------------------------------

    const loadEvents = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await eventsApi.list(
                filter === 'upcoming',
                undefined,
                true,
            );

            // Pour le filtre "passés", on charge tout et filtre côté client
            if (filter === 'past') {
                const allData = await eventsApi.list(false, undefined, true);
                const today = new Date().toISOString().split('T')[0];
                setEvents(allData.filter(e => e.event_date < today));
            } else if (filter === 'all') {
                const allData = await eventsApi.list(false, undefined, true);
                setEvents(allData);
            } else {
                setEvents(data);
            }
        } catch (err) {
            console.error('Erreur chargement événements:', err);
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }, [filter]);

    useEffect(() => { loadEvents(); }, [loadEvents]);

    // Vérifier si S3 est configuré
    useEffect(() => {
        eventsApi.storageStatus()
            .then(configured => setStorageConfigured(configured))
            .catch(() => setStorageConfigured(false));
    }, []);

    // ------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------

    const handleDelete = async (id: number) => {
        try {
            await eventsApi.delete(id);
            await loadEvents();
        } catch (err) {
            console.error('Erreur suppression:', err);
        } finally {
            setDeletingId(null);
        }
    };

    const handleDuplicate = async (event: Event) => {
        try {
            await eventsApi.duplicate(event.id);
            await loadEvents();
        } catch (err) {
            console.error('Erreur duplication:', err);
        }
    };

    const handleTogglePublish = async (event: Event) => {
        try {
            if (event.status === 'published') {
                await eventsApi.unpublish(event.id);
            } else {
                await eventsApi.publish(event.id);
            }
            await loadEvents();
        } catch (err) {
            console.error('Erreur publication:', err);
        }
    };

    // ------------------------------------------------------------------
    // Stats
    // ------------------------------------------------------------------

    const stats = events.reduce(
        (acc, e) => {
            if (e.status === 'published') acc.published++;
            else acc.draft++;
            return acc;
        },
        { published: 0, draft: 0 },
    );

    // ------------------------------------------------------------------
    // Formatage
    // ------------------------------------------------------------------

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    const isToday = (dateStr: string) => {
        return dateStr === new Date().toISOString().split('T')[0];
    };

    const isPast = (dateStr: string) => {
        return dateStr < new Date().toISOString().split('T')[0];
    };

    // ------------------------------------------------------------------
    // Rendu badge statut
    // ------------------------------------------------------------------

    const renderStatusBadge = (event: Event) => {
        if (event.status === 'published') {
            return (
                <Badge className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/10">
                    <Check className="w-3 h-3" /> Publié
                </Badge>
            );
        }
        return (
            <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">
                <FileEdit className="w-3 h-3" /> Brouillon
            </Badge>
        );
    };

    // ------------------------------------------------------------------
    // Carte d'événement
    // ------------------------------------------------------------------

    const renderEventCard = (event: Event) => {
        const palette = generateEventPalette(event.color || '#3498DB');
        const today = isToday(event.event_date);
        const past = isPast(event.event_date);

        return (
            <Card
                key={event.id}
                className={`
                    overflow-hidden transition-all hover:shadow-lg
                    ${canEdit ? 'cursor-pointer' : ''}
                    ${today ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                    ${past ? 'opacity-60' : ''}
                `}
                onClick={() => canEdit && setSelectedEvent(event)}
            >
                {/* Bande de couleur en haut */}
                <div className="h-2" style={{ backgroundColor: event.color || '#3498DB' }} />

                <CardContent className="p-4 space-y-3">
                    {/* Header : date + statut */}
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className={`text-sm font-medium ${today ? 'text-primary' : 'text-muted-foreground'}`}>
                                {today ? "Aujourd'hui" : formatDate(event.event_date)}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {renderStatusBadge(event)}
                            {canEdit && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <MoreVertical className="w-4 h-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={e => { e.stopPropagation(); setSelectedEvent(event); }}>
                                            <Pencil className="w-4 h-4 mr-2" /> Modifier
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={e => { e.stopPropagation(); handleTogglePublish(event); }}>
                                            {event.status === 'published' ? (
                                                <><FileEdit className="w-4 h-4 mr-2" /> Dépublier</>
                                            ) : (
                                                <><Send className="w-4 h-4 mr-2" /> Publier</>
                                            )}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDuplicate(event); }}>
                                            <Copy className="w-4 h-4 mr-2" /> Dupliquer
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={e => { e.stopPropagation(); setDeletingId(event.id); }}
                                            className="text-destructive focus:text-destructive"
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>

                    {/* Contenu événement */}
                    <div
                        className="rounded-lg p-3"
                        style={{ backgroundColor: palette.bg, borderColor: palette.border, border: '1px solid' }}
                    >
                        <h3 className="text-lg font-bold leading-tight" style={{ color: palette.text }}>
                            {event.title}
                        </h3>
                        {event.subtitle && (
                            <p className="text-sm mt-0.5" style={{ color: palette.textMuted }}>
                                {event.subtitle}
                            </p>
                        )}
                    </div>

                    {/* Images miniatures */}
                    {event.images && event.images.length > 0 && (
                        <div className="flex gap-1.5">
                            {event.images.slice(0, 4).map(img => (
                                <div
                                    key={img.id}
                                    className="w-12 h-12 rounded-md overflow-hidden border border-border bg-muted"
                                >
                                    <img
                                        src={img.url}
                                        alt=""
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            ))}
                            {event.images.length > 4 && (
                                <div className="w-12 h-12 rounded-md border border-border bg-muted flex items-center justify-center">
                                    <span className="text-xs text-muted-foreground">+{event.images.length - 4}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Indicateurs */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {event.images && event.images.length > 0 && (
                            <span className="flex items-center gap-1">
                                <ImageIcon className="w-3 h-3" /> {event.images.length} image{event.images.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    };

    // ------------------------------------------------------------------
    // Erreur
    // ------------------------------------------------------------------

    if (error && !isLoading) {
        return (
            <div className="container-mariam py-6">
                <InlineError
                    type={getErrorType(error)}
                    onRetry={loadEvents}
                    showLogo={false}
                />
            </div>
        );
    }

    // ------------------------------------------------------------------
    // Rendu principal
    // ------------------------------------------------------------------

    return (
        <div className="container-mariam py-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Événements</h1>
                    <p className="text-muted-foreground">
                        Gérez les événements spéciaux affichés sur le menu public
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Stats */}
                    <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                            <Check className="w-3 h-3 mr-1" /> {stats.published}
                        </Badge>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                            <FileEdit className="w-3 h-3 mr-1" /> {stats.draft}
                        </Badge>
                    </div>

                    {/* Bouton créer */}
                    {canEdit && (
                        <Button onClick={() => setIsCreating(true)} className="gap-2">
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">Nouvel événement</span>
                            <span className="sm:hidden">Nouveau</span>
                        </Button>
                    )}
                </div>
            </div>

            {/* Filtres */}
            <div className="flex gap-2 mb-6">
                {([
                    { key: 'upcoming' as const, label: 'À venir' },
                    { key: 'past' as const, label: 'Passés' },
                    { key: 'all' as const, label: 'Tous' },
                ]).map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={`
                            px-4 py-2 rounded-lg text-sm font-medium transition-colors
                            ${filter === f.key
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }
                        `}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Contenu */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Megaphone className="w-16 h-16 text-muted-foreground/30 mb-4" />
                    <h2 className="text-lg font-medium text-foreground mb-1">
                        {filter === 'upcoming' ? 'Aucun événement à venir' :
                         filter === 'past' ? 'Aucun événement passé' :
                         'Aucun événement'}
                    </h2>
                    <p className="text-muted-foreground text-sm mb-4">
                        {canEdit ? 'Créez votre premier événement pour animer le restaurant' : "Aucun événement n'a été programmé"}
                    </p>
                    {canEdit && (
                        <Button onClick={() => setIsCreating(true)} className="gap-2">
                            <Plus className="w-4 h-4" /> Créer un événement
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {events.map(event => renderEventCard(event))}
                </div>
            )}

            {/* Dialog de confirmation de suppression */}
            {deletingId !== null && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-card rounded-lg p-6 max-w-sm w-full border border-border shadow-xl">
                        <h3 className="text-lg font-bold mb-2">Supprimer l'événement ?</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Cette action est irréversible. Les images associées seront également supprimées.
                        </p>
                        <div className="flex gap-2 justify-end">
                            <Button variant="ghost" onClick={() => setDeletingId(null)}>
                                Annuler
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => handleDelete(deletingId)}
                                className="gap-2"
                            >
                                <Trash2 className="w-4 h-4" /> Supprimer
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Editor dialog */}
            {(isCreating || selectedEvent) && (
                <EventEditor
                    event={selectedEvent}
                    storageConfigured={storageConfigured}
                    onClose={() => {
                        setSelectedEvent(null);
                        setIsCreating(false);
                    }}
                    onSave={async () => {
                        await loadEvents();
                        setSelectedEvent(null);
                        setIsCreating(false);
                    }}
                />
            )}
        </div>
    );
}
