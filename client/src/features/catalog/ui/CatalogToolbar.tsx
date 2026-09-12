import {
  Check,
  CheckSquare,
  Download,
  LayoutGrid,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import type { CertificationItem, DietaryTag, MenuCategory } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getCategoryColor } from '@/lib/category-colors';
import { PERIOD_LABELS, type CatalogFilters } from '../hooks/useCatalogFilters';
import { PeriodMenu } from './PeriodMenu';
import { SortMenu, type SortOption } from './SortMenu';
import { CertificationLogo } from './TaxonomyBadges';
import { CONTROL, CONTROL_BASE, CONTROL_ICON, CONTROL_SQUARE } from './control';

function Row({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
      )}
    >
      <span className="flex min-w-0 items-center gap-2">{children}</span>
      {active && <Check className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Retirer ${label}`}>
        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
      </button>
    </span>
  );
}

/** CSV is a desktop job: the file picker and the preview table have no room on a phone. */
function CsvAction({
  icon: ActionIcon,
  label,
  title,
  onClick,
}: {
  icon: typeof Upload;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        CONTROL_SQUARE,
        'hidden text-muted-foreground hover:text-foreground lg:flex xl:w-auto xl:px-3'
      )}
    >
      <ActionIcon className={CONTROL_ICON} />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function CatalogToolbar({
  filters,
  patch,
  activeCount,
  clear,
  sorts,
  ascending,
  onSort,
  categories,
  allTags,
  allCerts,
  total,
  view,
  onViewChange,
  selecting,
  onToggleSelect,
  onCreate,
  onImport,
  onExport,
}: {
  filters: CatalogFilters;
  patch: (next: Partial<CatalogFilters>) => void;
  activeCount: number;
  clear: () => void;
  sorts: SortOption[];
  ascending: boolean;
  onSort: (value: string) => void;
  categories?: MenuCategory[];
  allTags?: DietaryTag[];
  allCerts?: CertificationItem[];
  total?: number;
  view?: 'cards' | 'list';
  onViewChange?: (view: 'cards' | 'list') => void;
  selecting?: boolean;
  onToggleSelect?: () => void;
  onCreate?: () => void;
  onImport?: () => void;
  onExport?: () => void;
}) {
  const tree = categories ?? [];
  const flat = tree.flatMap((parent) => [parent, ...(parent.subcategories ?? [])]);
  const hasFilters = tree.length > 0 || (allTags?.length ?? 0) > 0;

  const toggleIn = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={filters.q}
            onChange={(event) => patch({ q: event.target.value })}
            placeholder="Rechercher un plat…"
            // Its own padding: the icon sits in it, and CONTROL's would fight it
            className={cn(
              CONTROL_BASE,
              'h-[38px] w-full pl-9 pr-2 placeholder:text-muted-foreground sm:h-[34px] sm:pr-3'
            )}
          />
        </div>

        {onCreate && (
          <Button
            size="sm"
            onClick={onCreate}
            aria-label="Nouveau plat"
            className="h-[38px] w-[38px] p-0 sm:h-[34px] sm:w-auto sm:px-3"
          >
            <Plus className={CONTROL_ICON} />
            <span className="hidden sm:inline">Nouveau plat</span>
          </Button>
        )}
      </div>

      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:gap-2 sm:overflow-visible sm:px-0">
        {hasFilters && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Filtres"
                className={cn(activeCount > 0 ? CONTROL : CONTROL_SQUARE, 'sm:w-auto sm:px-3')}
              >
                <SlidersHorizontal className={cn(CONTROL_ICON, 'text-muted-foreground')} />
                <span className="hidden sm:inline">Filtres</span>
                {activeCount > 0 && (
                  <span className="rounded bg-primary/10 px-1.5 text-xs font-medium text-primary">
                    {activeCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="max-h-[70vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-3"
            >
              {tree.length > 0 && (
                <Group title="Catégorie">
                  {tree.map((parent) => {
                    const children = parent.subcategories ?? [];
                    // A category with subcategories carries no dish, so it heads
                    // its children instead of being selectable itself.
                    if (children.length > 0) {
                      return (
                        <div key={parent.id} className="pt-1">
                          <p className="px-2 pb-0.5 text-[11px] text-muted-foreground">
                            {parent.label}
                          </p>
                          {children.map((child) => (
                            <Row
                              key={child.id}
                              active={filters.categoryIds.includes(child.id)}
                              onClick={() =>
                                patch({ categoryIds: toggleIn(filters.categoryIds, child.id) })
                              }
                            >
                              <span
                                className="ml-2 h-2 w-2 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: getCategoryColor(child.color_key, child.order)
                                    .bg,
                                }}
                              />
                              <span className="truncate">{child.label}</span>
                            </Row>
                          ))}
                        </div>
                      );
                    }
                    return (
                      <Row
                        key={parent.id}
                        active={filters.categoryIds.includes(parent.id)}
                        onClick={() =>
                          patch({ categoryIds: toggleIn(filters.categoryIds, parent.id) })
                        }
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: getCategoryColor(parent.color_key, parent.order).bg,
                          }}
                        />
                        <span className="truncate">{parent.label}</span>
                      </Row>
                    );
                  })}
                </Group>
              )}

              {(allTags?.length ?? 0) > 0 && (
                <Group title="Labels alimentaires">
                  {allTags?.map((tag) => (
                    <Row
                      key={tag.id}
                      active={filters.tagIds.includes(tag.id)}
                      onClick={() => patch({ tagIds: toggleIn(filters.tagIds, tag.id) })}
                    >
                      {tag.icon && (
                        <Icon name={tag.icon as IconName} className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{tag.label}</span>
                    </Row>
                  ))}
                </Group>
              )}

              {(allCerts?.length ?? 0) > 0 && (
                <Group title="Certifications">
                  {allCerts?.map((cert) => (
                    <Row
                      key={cert.id}
                      active={filters.certIds.includes(cert.id)}
                      onClick={() => patch({ certIds: toggleIn(filters.certIds, cert.id) })}
                    >
                      <CertificationLogo certification={cert} className="h-4 w-4" />
                      <span className="truncate">{cert.name}</span>
                    </Row>
                  ))}
                </Group>
              )}

              {activeCount > 0 && (
                <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={clear}>
                  Tout effacer
                </Button>
              )}
            </PopoverContent>
          </Popover>
        )}

        <PeriodMenu value={filters.period} onChange={(period) => patch({ period })} />
        <SortMenu options={sorts} value={filters.sort} ascending={ascending} onSort={onSort} />

        {onToggleSelect && (
          <button
            type="button"
            onClick={onToggleSelect}
            aria-pressed={selecting}
            aria-label={selecting ? 'Quitter la sélection' : 'Sélectionner des plats'}
            className={cn(
              CONTROL_SQUARE,
              'lg:w-auto lg:px-3',
              selecting && 'border-primary text-primary'
            )}
          >
            <CheckSquare className={CONTROL_ICON} />
            <span className="hidden lg:inline">Sélectionner</span>
          </button>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1.5 sm:gap-2 sm:pl-2">
          {typeof total === 'number' && (
            <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              {total} plat{total > 1 ? 's' : ''}
            </span>
          )}
          {onImport && (
            <CsvAction
              icon={Upload}
              label="Importer"
              title="Importer des plats"
              onClick={onImport}
            />
          )}
          {onExport && (
            <CsvAction
              icon={Download}
              label="Exporter"
              title={`Exporter en CSV${typeof total === 'number' ? ` (${total} plats)` : ''}`}
              onClick={onExport}
            />
          )}
          {view && onViewChange && (
            <div className="hidden items-center rounded-lg border border-border bg-card p-0.5 lg:flex">
              {(['cards', 'list'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-label={mode === 'cards' ? 'Vue cartes' : 'Vue liste'}
                  aria-pressed={view === mode}
                  onClick={() => onViewChange(mode)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                    view === mode ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                  )}
                >
                  {mode === 'cards' ? (
                    <LayoutGrid className="h-4 w-4" />
                  ) : (
                    <List className="h-4 w-4" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {(activeCount > 0 || filters.period !== 'all') && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {filters.categoryIds.map((id) => (
            <Chip
              key={id}
              label={flat.find((category) => category.id === id)?.label ?? String(id)}
              onRemove={() =>
                patch({ categoryIds: filters.categoryIds.filter((value) => value !== id) })
              }
            />
          ))}
          {filters.tagIds.map((id) => (
            <Chip
              key={id}
              label={allTags?.find((tag) => tag.id === id)?.label ?? id}
              onRemove={() => patch({ tagIds: filters.tagIds.filter((value) => value !== id) })}
            />
          ))}
          {filters.certIds.map((id) => (
            <Chip
              key={id}
              label={allCerts?.find((cert) => cert.id === id)?.name ?? id}
              onRemove={() => patch({ certIds: filters.certIds.filter((value) => value !== id) })}
            />
          ))}
          {filters.period !== 'all' && (
            <Chip label={PERIOD_LABELS[filters.period]} onRemove={() => patch({ period: 'all' })} />
          )}
        </div>
      )}
    </div>
  );
}
