import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { newsApi, type News, type NewsQuery } from '@/lib/api/news';
import { notify } from '@/lib/toast';
import { parisToday } from '@/lib/date-utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InlineError } from '@/components/InlineError';
import { getErrorType } from '@/lib/api/errors';
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
  Calendar,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Pin,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useSiteRef } from '@/contexts/SiteContext';

type Tab = 'all' | 'upcoming' | 'drafts';

const PER_PAGE = 12;

const TABS: { key: Tab; label: string; empty: string }[] = [
  { key: 'all', label: 'Toutes', empty: 'Aucune actualité' },
  { key: 'upcoming', label: 'À venir', empty: 'Aucune actualité datée à venir' },
  { key: 'drafts', label: 'Brouillons', empty: 'Aucun brouillon' },
];

function queryOf(tab: Tab): NewsQuery {
  if (tab === 'upcoming') return { sort: 'date', from: parisToday() };
  if (tab === 'drafts') return { status: 'draft' };
  return {};
}

function whenOf(item: News): string | null {
  if (item.date) {
    return new Date(`${item.date}T00:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  if (item.published_at) {
    const day = new Date(item.published_at).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Paris',
    });
    return `Publiée le ${day}`;
  }
  return null;
}

export function NewsPage() {
  const site = useSiteRef();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = user?.role === 'admin' || user?.role === 'editor';

  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<News[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [deleting, setDeleting] = useState<News | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await newsApi.list(site, { ...queryOf(tab), page, per_page: PER_PAGE });
      setItems(list.items);
      setTotal(list.total_count);
    } catch (err) {
      console.error('Loading the news failed:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [site, tab, page]);

  useEffect(() => {
    load();
  }, [load]);

  const changeTab = (next: string) => {
    setTab(next as Tab);
    setPage(1);
  };

  const handleDelete = async (item: News) => {
    try {
      await newsApi.remove(site, item.id);
      await load();
      notify.success('Actualité supprimée');
    } catch {
      notify.error("L'actualité n'a pas pu être supprimée.");
    }
  };

  const handleDuplicate = async (item: News) => {
    try {
      await newsApi.duplicate(site, item.id);
      await load();
      notify.success('Actualité dupliquée, en brouillon');
    } catch {
      notify.error("L'actualité n'a pas pu être dupliquée.");
    }
  };

  const handleTogglePublish = async (item: News) => {
    try {
      const wasPublished = item.status === 'published';
      if (wasPublished) {
        await newsApi.unpublish(site, item.id);
      } else {
        await newsApi.publish(site, item.id);
        window.umami?.track('event-publish');
      }
      await load();
      notify.success(wasPublished ? 'Actualité retirée de la page' : 'Actualité publiée');
    } catch {
      notify.error("La publication n'a pas pu être changée.");
    }
  };

  const edit = (item: News) => navigate(`/admin/news/${item.id}/edit`);

  const renderCard = (item: News) => {
    const photo = item.images[0]?.url;
    const color = item.color || '#3498DB';
    const past = item.date !== null && item.date < parisToday();
    const when = whenOf(item);

    return (
      <Card
        key={item.id}
        className={`overflow-hidden transition-shadow hover:shadow-md ${canEdit ? 'cursor-pointer' : ''}`}
        onClick={() => canEdit && edit(item)}
      >
        <CardContent className="flex h-full gap-3 p-3 sm:p-4">
          {photo ? (
            <img
              src={photo}
              alt=""
              className="h-20 w-20 shrink-0 rounded-lg bg-muted object-cover"
            />
          ) : (
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${color}1f`, color }}
            >
              <Megaphone className="h-7 w-7" />
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 font-semibold leading-tight text-foreground">
                {item.title}
              </h3>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-mr-1.5 -mt-1 h-8 w-8 shrink-0 p-0"
                      aria-label={`Actions pour ${item.title}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenuItem onClick={() => edit(item)}>
                      <Pencil className="mr-2 h-4 w-4" /> Modifier
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleTogglePublish(item)}>
                      {item.status === 'published' ? (
                        <>
                          <FileEdit className="mr-2 h-4 w-4" /> Retirer de la page
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" /> Publier
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicate(item)}>
                      <Copy className="mr-2 h-4 w-4" /> Dupliquer
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleting(item)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {item.summary && (
              <p className="line-clamp-1 text-sm text-muted-foreground">{item.summary}</p>
            )}
            <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs">
              {when && (
                <span
                  className={`flex items-center gap-1 ${past ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}
                >
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span className="first-letter:uppercase">{when}</span>
                </span>
              )}
              {item.pinned && (
                <Badge className="gap-1 bg-primary/10 px-1.5 py-0 text-primary hover:bg-primary/10">
                  <Pin className="h-3 w-3" /> À la une
                </Badge>
              )}
              {item.status !== 'published' && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-amber-500/10 px-1.5 py-0 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                >
                  <FileEdit className="h-3 w-3" /> Brouillon
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (error && !isLoading) {
    return (
      <div className="container-mariam py-6">
        <InlineError type={getErrorType(error)} onRetry={load} showLogo={false} />
      </div>
    );
  }

  const empty = TABS.find((entry) => entry.key === tab)!.empty;

  return (
    <div className="container-mariam py-6">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Actualités</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Votre page publique montre les 6 premières actualités publiées : celles à la une
            d'abord, puis les plus récentes.
          </p>
        </div>

        {canEdit && (
          <Button onClick={() => navigate('/admin/news/new')} className="gap-2 self-start">
            <Plus className="h-4 w-4" /> Nouvelle actualité
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={changeTab} className="mb-6">
        <TabsList className="grid w-full grid-cols-3 sm:inline-grid sm:w-auto">
          {TABS.map((entry) => (
            <TabsTrigger key={entry.key} value={entry.key} className="sm:px-5">
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-8 text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Megaphone className="mb-4 h-16 w-16 text-muted-foreground/30" />
          <h2 className="mb-1 text-lg font-medium text-foreground">{empty}</h2>
          {canEdit && tab === 'all' && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Annoncez un repas à thème, une animation ou une nouveauté du restaurant.
              </p>
              <Button onClick={() => navigate('/admin/news/new')} className="gap-2">
                <Plus className="h-4 w-4" /> Créer une actualité
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map(renderCard)}</div>

          {totalPages > 1 && (
            <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-sm text-muted-foreground">
                {total} actualité{total > 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" /> Précédent
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="gap-1"
                >
                  Suivant <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleting?.title} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'actualité et ses photos sont supprimées définitivement, et disparaissent de votre
              page publique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) handleDelete(deleting);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
