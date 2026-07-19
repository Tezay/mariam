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
import { useNavigate } from 'react-router-dom';
import { eventsApi, Event } from '@/lib/api';
import { notify } from '@/lib/toast';
import { parisToday } from '@/lib/date-utils';
import { useAuth } from '@/contexts/AuthContext';
import { generateEventPalette } from '@/lib/color-utils';
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
  const navigate = useNavigate();
  const canEdit = user?.role === 'admin' || user?.role === 'editor';

  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<FilterMode>('upcoming');

  // Confirm delete
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ------------------------------------------------------------------
  // Chargement
  // ------------------------------------------------------------------

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await eventsApi.list(filter === 'upcoming', undefined, true);

      // Pour le filtre "passés", on charge tout et filtre côté client
      if (filter === 'past') {
        const allData = await eventsApi.list(false, undefined, true);
        const today = parisToday();
        setEvents(allData.filter((e) => e.event_date < today));
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

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  const handleDelete = async (id: number) => {
    try {
      await eventsApi.delete(id);
      await loadEvents();
      notify.success('Événement supprimé');
    } catch {
      notify.error("Erreur lors de la suppression de l'événement");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (event: Event) => {
    try {
      await eventsApi.duplicate(event.id);
      await loadEvents();
      notify.success('Événement dupliqué');
    } catch {
      notify.error('Erreur lors de la duplication');
    }
  };

  const handleTogglePublish = async (event: Event) => {
    try {
      const wasPublished = event.status === 'published';
      if (wasPublished) {
        await eventsApi.unpublish(event.id);
      } else {
        await eventsApi.publish(event.id);
        window.umami?.track('event-publish');
      }
      await loadEvents();
      notify.success(wasPublished ? 'Événement dépublié' : 'Événement publié');
    } catch {
      notify.error('Erreur lors de la publication');
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
    { published: 0, draft: 0 }
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
    return dateStr === parisToday();
  };

  const isPast = (dateStr: string) => {
    return dateStr < parisToday();
  };

  // ------------------------------------------------------------------
  // Rendu badge statut
  // ------------------------------------------------------------------

  const renderStatusBadge = (event: Event) => {
    if (event.status === 'published') {
      return (
        <Badge className="gap-1 bg-green-500/10 text-green-600 hover:bg-green-500/10 dark:text-green-400">
          <Check className="h-3 w-3" /> Publié
        </Badge>
      );
    }
    return (
      <Badge
        variant="secondary"
        className="gap-1 bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
      >
        <FileEdit className="h-3 w-3" /> Brouillon
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
        className={`overflow-hidden transition-all hover:shadow-lg ${canEdit ? 'cursor-pointer' : ''} ${today ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''} ${past ? 'opacity-60' : ''} `}
        onClick={() => canEdit && navigate(`/admin/events/${event.id}/edit`)}
      >
        {/* Bande de couleur en haut */}
        <div className="h-2" style={{ backgroundColor: event.color || '#3498DB' }} />

        <CardContent className="space-y-3 p-4">
          {/* Header : date + statut */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span
                className={`text-sm font-medium ${today ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {today ? "Aujourd'hui : en cours" : formatDate(event.event_date)}
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
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/events/${event.id}/edit`);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" /> Modifier
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePublish(event);
                      }}
                    >
                      {event.status === 'published' ? (
                        <>
                          <FileEdit className="mr-2 h-4 w-4" /> Dépublier
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" /> Publier
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate(event);
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" /> Dupliquer
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(event.id);
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Contenu événement */}
          <div
            className="rounded-lg p-3"
            style={{
              backgroundColor: palette.bg,
              borderColor: palette.border,
              border: '1px solid',
            }}
          >
            <h3 className="text-lg font-bold leading-tight" style={{ color: palette.text }}>
              {event.title}
            </h3>
            {event.subtitle && (
              <p className="mt-0.5 text-sm" style={{ color: palette.textMuted }}>
                {event.subtitle}
              </p>
            )}
          </div>

          {/* Images miniatures */}
          {event.images && event.images.length > 0 && (
            <div className="flex gap-1.5">
              {event.images.slice(0, 4).map((img) => (
                <div
                  key={img.id}
                  className="h-12 w-12 overflow-hidden rounded-md border border-border bg-muted"
                >
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
              {event.images.length > 4 && (
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-muted">
                  <span className="text-xs text-muted-foreground">+{event.images.length - 4}</span>
                </div>
              )}
            </div>
          )}

          {/* Indicateurs */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {event.images && event.images.length > 0 && (
              <span className="flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> {event.images.length} image
                {event.images.length > 1 ? 's' : ''}
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
        <InlineError type={getErrorType(error)} onRetry={loadEvents} showLogo={false} />
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Rendu principal
  // ------------------------------------------------------------------

  return (
    <div className="container-mariam py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Événements</h1>
          <p className="text-muted-foreground">
            Gérez les événements spéciaux affichés sur le menu public
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Stats */}
          <div className="flex items-center gap-2 text-sm">
            <Badge
              variant="outline"
              className="border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400"
            >
              <Check className="mr-1 h-3 w-3" /> {stats.published}
            </Badge>
            <Badge
              variant="outline"
              className="border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            >
              <FileEdit className="mr-1 h-3 w-3" /> {stats.draft}
            </Badge>
          </div>

          {/* Bouton créer */}
          {canEdit && (
            <Button onClick={() => navigate('/admin/events/new')} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nouvel événement</span>
              <span className="sm:hidden">Nouveau</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="mb-6 flex gap-2">
        {[
          { key: 'upcoming' as const, label: 'À venir' },
          { key: 'past' as const, label: 'Passés' },
          { key: 'all' as const, label: 'Tous' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            } `}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Megaphone className="mb-4 h-16 w-16 text-muted-foreground/30" />
          <h2 className="mb-1 text-lg font-medium text-foreground">
            {filter === 'upcoming'
              ? 'Aucun événement à venir'
              : filter === 'past'
                ? 'Aucun événement passé'
                : 'Aucun événement'}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {canEdit
              ? 'Créez votre premier événement pour animer le restaurant'
              : "Aucun événement n'a été programmé"}
          </p>
          {canEdit && (
            <Button onClick={() => navigate('/admin/events/new')} className="gap-2">
              <Plus className="h-4 w-4" /> Créer un événement
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => renderEventCard(event))}
        </div>
      )}

      {/* Dialog de confirmation de suppression */}
      {deletingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold">Supprimer l'événement ?</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Cette action est irréversible. Les images associées seront également supprimées.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeletingId(null)}>
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDelete(deletingId)}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" /> Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
