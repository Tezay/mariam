import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookOpen } from 'lucide-react';
import {
  catalogApi,
  categoriesApi,
  orgApi,
  publicApi,
  type DishSort,
  type OrgCatalogSort,
} from '@/lib/api';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { useDebounce } from '@/hooks/useDebounce';
import { downloadBlob } from '@/lib/download';
import { notify } from '@/lib/toast';
import { CatalogueImportDialog } from '@/pages/admin/catalogue/CatalogueImportDialog';
import {
  ORG_SORTS,
  SITE_SORTS,
  rowFromDish,
  rowFromPooled,
  type CatalogRow,
  type CatalogScope,
} from './catalog-row';
import { useCatalogFilters } from './hooks/useCatalogFilters';
import { isAscending, nextSort } from './rules';
import { useRubberBand } from '@/hooks/useRubberBand';
import { useBulkActions } from './hooks/useBulkActions';
import { BulkBar } from './ui/BulkBar';
import { DishContextMenu } from './ui/DishContextMenu';
import { CatalogToolbar } from './ui/CatalogToolbar';
import { DishCards, DishCardsSkeleton } from './ui/DishCards';
import { DishTable } from './ui/DishTable';
import { DishCreateDialog } from './DishCreateDialog';
import { DishGroupPanel } from './DishGroupPanel';

const PAGE_SIZE = 24;
const VIEW_KEY = 'mariam-catalogue-view';

export function CatalogView({ scope }: { scope: CatalogScope }) {
  const isOrg = scope === 'org';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { filters, patch, activeCount, clear } = useCatalogFilters('usage');
  const query = useDebounce(filters.q, 300);

  const [view, setView] = useState<'cards' | 'list'>(
    () => (localStorage.getItem(VIEW_KEY) as 'cards' | 'list') ?? 'cards'
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [groupName, setGroupName] = useState<string | null>(null);
  // A dish page sends its own id here to open the selection already started.
  const preselected = (useLocation().state as { compare?: number } | null)?.compare;
  const [selected, setSelected] = useState<Set<string> | null>(
    preselected ? new Set([String(preselected)]) : null
  );
  const [contextKey, setContextKey] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);

  const chooseView = (mode: 'cards' | 'list') => {
    setView(mode);
    localStorage.setItem(VIEW_KEY, mode);
  };

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
    enabled: !isOrg,
  });

  const shared = {
    q: query || undefined,
    period: filters.period,
    order: filters.order ?? undefined,
  };
  const siteFilters = {
    ...shared,
    category_ids: filters.categoryIds.join(',') || undefined,
    tag_ids: filters.tagIds.join(',') || undefined,
    certification_ids: filters.certIds.join(',') || undefined,
  };

  const siteQuery = useInfiniteQuery({
    queryKey: [
      'catalogue',
      query,
      filters.sort,
      filters.order,
      filters.period,
      filters.categoryIds,
      filters.tagIds,
      filters.certIds,
    ],
    queryFn: ({ pageParam }) =>
      catalogApi.listPaginated({
        ...siteFilters,
        sort: filters.sort as DishSort,
        page: pageParam,
        per_page: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.has_more ? pages.length + 1 : undefined),
    enabled: !isOrg,
  });

  const orgQuery = useInfiniteQuery({
    queryKey: ['org', 'catalog', query, filters.sort, filters.order, filters.period],
    queryFn: ({ pageParam }) =>
      orgApi.getCatalog({
        ...shared,
        q: query,
        sort: filters.sort as OrgCatalogSort,
        page: pageParam,
        per_page: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.has_more ? pages.length + 1 : undefined),
    enabled: isOrg,
  });

  const active = isOrg ? orgQuery : siteQuery;
  const rows: CatalogRow[] = isOrg
    ? (orgQuery.data?.pages ?? []).flatMap((page) => page.dishes.map(rowFromPooled))
    : (siteQuery.data?.pages ?? []).flatMap((page) => page.dishes.map(rowFromDish));
  const total = active.data?.pages[0]?.total;

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = active;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const sortBy = useCallback(
    (picked: string) => patch(nextSort(filters, picked)),
    [filters, patch]
  );

  const toggleKeys = (keys: string[]) =>
    setSelected((current) => {
      const next = new Set(current ?? []);
      for (const key of keys) {
        if (next.has(key)) next.delete(key);
        else next.add(key);
      }
      return next;
    });

  const selectOnly = (keys: string[]) => setSelected(new Set(keys));

  /** Click, Ctrl/Cmd-click and Shift-click, as a file explorer reads them. */
  const activate = (row: CatalogRow, event: React.MouseEvent) => {
    if (isOrg) {
      setGroupName(row.key);
      return;
    }
    const additive = event.metaKey || event.ctrlKey;
    if (event.shiftKey && anchor.current) {
      const from = rows.findIndex((item) => item.key === anchor.current);
      const to = rows.findIndex((item) => item.key === row.key);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        const range = rows.slice(start, end + 1).map((item) => item.key);
        if (additive || selected) toggleKeys(range);
        else selectOnly(range);
        return;
      }
    }
    anchor.current = row.key;
    if (additive || selected) {
      toggleKeys([row.key]);
      return;
    }
    navigate(`/admin/catalogue/${row.key}`);
  };

  const exportCsv = async () => {
    try {
      downloadBlob(await catalogApi.exportCsv(siteFilters), 'catalogue.csv');
    } catch {
      notify.error("L'export a échoué");
    }
  };

  const lasso = useRubberBand({
    containerRef: listRef,
    itemSelector: '[data-dish-key]',
    enabled: !isOrg,
    mouseOnly: true,
    onSelect: (elements) =>
      selectOnly(elements.map((element) => element.dataset.dishKey ?? '').filter(Boolean)),
  });

  const selectedKeys = selected ? [...selected] : [];
  // An org row keys on a pooled name, not on a dish id: no bulk action there.
  const bulk = useBulkActions({
    ids: isOrg ? [] : selectedKeys.map(Number),
    categories: meta?.categories ?? [],
    allTags: meta?.allTags ?? [],
    allCerts: meta?.allCerts ?? [],
    onDone: () => setSelected(null),
  });

  const compare = (keys: string[]) => navigate(`/admin/catalogue/compare?ids=${keys.join(',')}`);

  const ascending = isAscending(filters.sort, filters.order);
  const empty = (
    <EmptyState
      icon={BookOpen}
      title={query || activeCount > 0 ? 'Aucun plat trouvé' : 'Aucun plat au catalogue'}
      description={
        query || activeCount > 0
          ? 'Aucun plat ne correspond à cette recherche.'
          : isOrg
            ? 'Les plats apparaîtront ici dès que vos sites en créeront.'
            : 'Créez votre premier plat pour composer vos menus.'
      }
    />
  );

  const list = (
    <div
      ref={listRef}
      className="relative"
      onContextMenu={(event) => {
        lasso.reset();
        const key = (event.target as HTMLElement).closest<HTMLElement>('[data-dish-key]')?.dataset
          .dishKey;
        setContextKey(key ?? null);
        // A dish outside the selection becomes the selection, so every action
        // below reads the same list whether it was opened from here or the bar.
        if (key && !selected?.has(key)) selectOnly([key]);
      }}
      {...lasso.handlers}
    >
      {lasso.rect && (
        <div
          className="pointer-events-none absolute z-30 rounded border border-primary bg-primary/10"
          style={{
            left: Math.min(lasso.rect.x1, lasso.rect.x2),
            top: Math.min(lasso.rect.y1, lasso.rect.y2),
            width: Math.abs(lasso.rect.x2 - lasso.rect.x1),
            height: Math.abs(lasso.rect.y2 - lasso.rect.y1),
          }}
        />
      )}
      <div className={view === 'list' ? 'lg:hidden' : ''}>
        <DishCards
          rows={rows}
          scope={scope}
          onActivate={activate}
          categories={meta?.categories}
          selection={selected ?? undefined}
        />
      </div>
      {view === 'list' && (
        <div className="hidden lg:block">
          <DishTable
            rows={rows}
            scope={scope}
            sort={filters.sort}
            ascending={ascending}
            onSort={sortBy}
            onActivate={activate}
            categories={meta?.categories}
            selection={selected ?? undefined}
          />
        </div>
      )}
    </div>
  );

  const withMenu = (
    <DishContextMenu
      count={selectedKeys.length}
      targetName={contextKey ? (rows.find((row) => row.key === contextKey)?.name ?? null) : null}
      actions={bulk}
      onClose={() => setContextKey(null)}
      onOpen={() => contextKey && navigate(`/admin/catalogue/${contextKey}`)}
      onDeselect={() => setSelected(null)}
      onCompare={() => compare(selectedKeys)}
    >
      {list}
    </DishContextMenu>
  );

  return (
    <div className="space-y-4">
      <CatalogToolbar
        filters={filters}
        patch={patch}
        activeCount={activeCount}
        clear={clear}
        sorts={isOrg ? ORG_SORTS : SITE_SORTS}
        ascending={ascending}
        onSort={sortBy}
        categories={meta?.categories}
        allTags={meta?.allTags}
        allCerts={meta?.allCerts}
        total={total}
        view={view}
        onViewChange={chooseView}
        selecting={selected !== null}
        onToggleSelect={isOrg ? undefined : () => setSelected(selected ? null : new Set())}
        onCreate={isOrg ? undefined : () => setCreateOpen(true)}
        onImport={isOrg ? undefined : () => setImportOpen(true)}
        onExport={isOrg ? undefined : exportCsv}
      />

      {active.isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Catalogue indisponible"
          description="Les plats n'ont pas pu être chargés. Réessayez dans un instant."
        />
      ) : active.isPending ? (
        <DishCardsSkeleton />
      ) : rows.length === 0 ? (
        empty
      ) : (
        <>
          {isOrg ? list : withMenu}

          <div ref={sentinel} aria-hidden className="h-px" />
          {isFetchingNextPage && <DishCardsSkeleton count={3} />}
        </>
      )}

      {selected && (
        <BulkBar
          count={selected.size}
          actions={bulk}
          onClear={() => setSelected(null)}
          onCompare={() => compare(selectedKeys)}
        />
      )}

      {!isOrg && (
        <>
          {bulk.dialogs}
          <DishCreateDialog
            open={createOpen}
            categories={meta?.categories ?? []}
            onClose={() => setCreateOpen(false)}
          />
          <CatalogueImportDialog
            open={importOpen}
            categories={meta?.categories ?? []}
            allTags={meta?.allTags ?? []}
            allCerts={meta?.allCerts ?? []}
            onClose={() => setImportOpen(false)}
            onImported={() => queryClient.invalidateQueries({ queryKey: ['catalogue'] })}
          />
        </>
      )}

      {isOrg && <DishGroupPanel normalizedName={groupName} onClose={() => setGroupName(null)} />}
    </div>
  );
}
