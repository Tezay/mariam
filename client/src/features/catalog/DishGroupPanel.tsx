import { useQuery } from '@tanstack/react-query';
import { Check, Minus } from 'lucide-react';
import { orgApi } from '@/lib/api/org';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { RatingDistribution } from '@/features/analytics/ui/RatingDistribution';
import { SatisfactionTrendChart } from '@/features/analytics/ui/charts/SatisfactionTrendChart';
import { formatNumber, formatScore, plural } from '@/features/analytics/format';
import { DishThumb } from './ui/DishThumb';

export function DishGroupPanel({
  normalizedName,
  onClose,
}: {
  normalizedName: string | null;
  onClose: () => void;
}) {
  const { data: group, isPending } = useQuery({
    queryKey: ['org', 'catalog', 'group', normalizedName],
    queryFn: () => orgApi.getCatalogGroup(normalizedName as string),
    enabled: normalizedName !== null,
  });

  const trend = (group?.series ?? []).filter((point) => point.votes > 0);

  return (
    <Sheet open={normalizedName !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-6 pb-4 pt-6">
          <SheetTitle className="flex items-center gap-3">
            <DishThumb url={group?.image_url ?? null} className="h-9 w-9" />
            <span className="min-w-0 truncate">{group?.display_name ?? '…'}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {isPending && <Skeleton className="h-40 rounded-xl" />}

          {group && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Figure label="Sites" value={formatNumber(group.site_count)} />
                <Figure label="Servis 90 j" value={formatNumber(group.usage_count)} />
                <Figure label="Note" value={formatScore(group.score)} />
              </div>

              {group.votes > 0 ? (
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatNumber(group.votes)} {plural(group.votes, 'réponse')}
                  </h3>
                  <RatingDistribution counts={group.distribution} />
                  {trend.length > 1 && <SatisfactionTrendChart series={trend} granularity="day" />}
                </section>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucun avis sur ce plat pour le moment.
                </p>
              )}

              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Par site
                </h3>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {group.sites.map((site) => (
                    <li key={site.dish_id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {site.site_name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatNumber(site.usage_count)} servis
                      </span>
                      <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
                        {formatScore(site.score)}
                      </span>
                      <span
                        className="shrink-0 text-muted-foreground"
                        title={site.has_image ? 'Photo renseignée' : 'Sans photo'}
                      >
                        {site.has_image ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Minus className="h-3.5 w-3.5 opacity-50" />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
