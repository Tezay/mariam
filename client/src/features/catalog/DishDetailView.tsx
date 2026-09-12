import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, ImagePlus, Pencil, Scale, Trash2 } from 'lucide-react';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { catalogApi, categoriesApi, publicApi, type CatalogPeriod } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { notify } from '@/lib/toast';
import { getCategoryColor } from '@/lib/category-colors';
import { formatDayLabel, formatNumber, plural } from '@/features/analytics/format';
import { ReviewPanel } from './ui/ReviewPanel';
import { metricsOf } from './metrics';
import { DishMetrics } from './ui/DishMetrics';
import { CertificationLogo } from './ui/TaxonomyBadges';
import { SaveBar } from './ui/SaveBar';
import { DishThumb } from './ui/DishThumb';
import { PeriodMenu } from './ui/PeriodMenu';
import { DishFields } from './ui/DishFields';
import { categoryPath, pathLabel } from './categories';
import { duplicateFrom, type DuplicateDish } from './duplicate';
import { DuplicateNotice } from './ui/DuplicateNotice';
import { countChanges, draftOf, type DishDraft } from './dish-draft';

const USAGE_CHART: ChartConfig = { count: { label: 'Passages au menu', color: '#093EAA' } };
const SPARSE_SERIES = 10;

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-[22px] font-bold tabular-nums leading-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

export function DishDetailView({ dishId }: { dishId: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DishDraft | null>(null);
  const [baseline, setBaseline] = useState<DishDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateDish | null>(null);
  const [period, setPeriod] = useState<CatalogPeriod>('all');

  const dishQuery = useQuery({
    queryKey: ['dish', dishId],
    queryFn: () => catalogApi.get(dishId),
  });
  const statsQuery = useQuery({
    queryKey: ['dish', dishId, 'stats', period],
    queryFn: () => catalogApi.getStats(dishId, period),
  });
  const { data: meta } = useQuery({
    queryKey: ['catalogue-meta'],
    queryFn: async () => {
      const [catData, taxonomy] = await Promise.all([
        categoriesApi.list(),
        publicApi.getTaxonomy(),
      ]);
      return {
        categories: catData.categories,
        allTags: taxonomy.dietary_tag_categories.flatMap((group) => group.tags),
        allCerts: taxonomy.certification_categories.flatMap((group) => group.certifications),
      };
    },
    staleTime: 5 * 60_000,
  });

  const dish = dishQuery.data;

  useEffect(() => {
    if (!dish) return;
    const next = draftOf(dish);
    setDraft(next);
    setBaseline(next);
  }, [dish]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['dish', dishId] });
    queryClient.invalidateQueries({ queryKey: ['catalogue'] });
  };

  const save = useMutation({
    mutationFn: (next: DishDraft) =>
      catalogApi.update(dishId, {
        name: next.name.trim(),
        category_id: next.categoryId,
        tag_ids: next.tagIds,
        certification_ids: next.certIds,
      }),
    onSuccess: (updated) => {
      setBaseline(draftOf(updated));
      setEditing(false);
      setDuplicate(null);
      invalidate();
      notify.success('Plat enregistré');
    },
    onError: (error) => {
      const existing = duplicateFrom(error);
      setDuplicate(existing);
      if (!existing) notify.error("Le plat n'a pas pu être enregistré");
    },
  });

  const image = useMutation({
    mutationFn: (file: File) => catalogApi.uploadImage(dishId, file),
    onSuccess: invalidate,
    onError: () => notify.error("La photo n'a pas pu être modifiée"),
  });

  const remove = useMutation({
    mutationFn: () => catalogApi.delete(dishId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalogue'] });
      navigate('/admin/catalogue');
    },
    onError: () => notify.error("Le plat n'a pas pu être supprimé"),
  });

  if (dishQuery.isPending) {
    return (
      <div className="container-mariam flex flex-col gap-6 py-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!dish || !draft || !baseline) {
    return (
      <div className="container-mariam flex min-h-64 flex-col items-center justify-center gap-4 py-6">
        <BookOpen className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground">Plat introuvable</p>
        <Button variant="outline" onClick={() => navigate('/admin/catalogue')}>
          <ArrowLeft className="h-4 w-4" /> Retour au catalogue
        </Button>
      </div>
    );
  }

  const stats = statsQuery.data;
  const changes = countChanges(draft, baseline);
  const path = categoryPath(meta?.categories ?? [], dish.category_id);
  const color = path ? getCategoryColor(path.leaf.color_key, path.leaf.order) : null;
  const history = (stats?.history ?? []).slice(-26);
  const missingCategory = draft.categoryId === null;
  const served = dish.usage_count > 0;

  return (
    <div className="container-mariam flex flex-col gap-8 py-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit text-muted-foreground"
        onClick={() => navigate('/admin/catalogue')}
      >
        <ArrowLeft className="h-4 w-4" /> Catalogue
      </Button>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col sm:flex-row">
          {/* The photo is taken out of the flow: in it, its natural height would beat the ratio
              through the flex item's min-height, and its width would follow the fields beside it. */}
          <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden sm:aspect-square sm:w-56 sm:self-start">
            {dish.image_url ? (
              <img
                src={dish.image_url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <DishThumb url={null} className="absolute inset-0 h-full w-full rounded-none" />
            )}
            <label className="absolute bottom-2 right-2 cursor-pointer rounded-lg border border-border bg-card/90 px-2.5 py-1.5 text-xs font-medium text-foreground backdrop-blur transition-colors hover:bg-card">
              <ImagePlus className="mr-1.5 inline h-3.5 w-3.5" />
              {dish.image_url ? 'Remplacer' : 'Ajouter'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={image.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) image.mutate(file);
                  event.target.value = '';
                }}
              />
            </label>
          </div>

          <div className="min-w-0 flex-1 p-5">
            {editing ? (
              <>
                <DishFields
                  draft={draft}
                  onChange={(next) => {
                    setDraft(next);
                    setDuplicate(null);
                  }}
                  categories={meta?.categories ?? []}
                  allTags={meta?.allTags ?? []}
                  allCerts={meta?.allCerts ?? []}
                />
                {missingCategory && (
                  <p className="mt-3 text-sm text-destructive">
                    Une catégorie est nécessaire pour enregistrer ce plat.
                  </p>
                )}
                {duplicate && (
                  <div className="mt-3">
                    <DuplicateNotice duplicate={duplicate} />
                  </div>
                )}
                <SaveBar
                  changes={changes}
                  saving={save.isPending}
                  disabled={missingCategory}
                  onSave={() => save.mutate(draft)}
                  onCancel={() => {
                    setDraft(baseline);
                    setEditing(false);
                  }}
                />
                {changes === 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-4"
                    onClick={() => setEditing(false)}
                  >
                    Terminer
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                      {dish.name}
                    </h1>
                    <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      {color && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: color.bg }}
                        />
                      )}
                      {pathLabel(path)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/admin/catalogue', { state: { compare: dish.id } })}
                    >
                      <Scale className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Comparer</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Modifier</span>
                    </Button>
                  </div>
                </div>

                {(dish.tags.length > 0 || dish.certifications.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {dish.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground"
                      >
                        {tag.icon && (
                          <Icon name={tag.icon as IconName} className="h-3 w-3 shrink-0" />
                        )}
                        {tag.label}
                      </span>
                    ))}
                    {dish.certifications.map((cert) => (
                      <span
                        key={cert.id}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground"
                      >
                        <CertificationLogo certification={cert} className="h-3.5 w-3.5" />
                        {cert.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-5 border-t border-border pt-4">
                  <DishMetrics
                    metrics={metricsOf({
                      usageCount: dish.usage_count,
                      votes: stats?.satisfaction.votes ?? 0,
                      score: stats?.satisfaction.score ?? null,
                    })}
                    className="gap-5 text-base"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <Section
        title="Avis des étudiants"
        action={<PeriodMenu value={period} onChange={setPeriod} />}
      >
        {statsQuery.isPending ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : (
          stats && (
            <div className="rounded-xl border border-border bg-card p-4">
              <ReviewPanel satisfaction={stats.satisfaction} settingsPath="/admin/settings" />
            </div>
          )
        )}
      </Section>

      <Section title="Passages au menu">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['7 jours', stats?.week],
            ['30 jours', stats?.month],
            ['6 mois', stats?.semester],
            ['1 an', stats?.year],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-border bg-card p-4">
              <Figure label={String(label)} value={formatNumber(Number(value ?? 0))} />
            </div>
          ))}
        </div>
        {history.length > 1 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <ChartContainer config={USAGE_CHART} className="h-[180px] w-full">
              <LineChart data={history} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="week"
                  tickFormatter={formatDayLabel}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelClassName="mb-1.5 border-b border-border pb-1.5"
                      labelFormatter={(label) => `Semaine du ${formatDayLabel(String(label))}`}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-count)"
                  strokeWidth={2}
                  dot={history.length <= SPARSE_SERIES ? { r: 3 } : false}
                />
              </LineChart>
            </ChartContainer>
          </div>
        )}
      </Section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          variant="ghost"
          size="sm"
          disabled={served}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-4 w-4" /> Supprimer ce plat
        </Button>
        {served && (
          <p className="text-sm text-muted-foreground">
            Ce plat figure dans {formatNumber(dish.usage_count)} {plural(dish.usage_count, 'menu')}{' '}
            et ne peut pas être supprimé.
          </p>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer «&nbsp;{dish.name}&nbsp;» ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le plat sera définitivement retiré du catalogue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate()}
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
