/**
 * The single table used across both dashboards.
 *
 * Built on the shadcn table primitives rather than raw markup so audit logs,
 * users, sites and analytics all render the same way; sorting, loading and
 * empty states live here instead of being re-implemented per page.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  /** Applied to both the header cell and every body cell. */
  className?: string;
  render: (row: T) => ReactNode;
  /** Omit to make the column non-sortable. Null values always sort last. */
  sortValue?: (row: T) => number | string | null;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string | number;
  defaultSortKey?: string;
  defaultAscending?: boolean;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyState?: ReactNode;
  /** Minimum width before the table scrolls horizontally. */
  minWidthClassName?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  defaultSortKey,
  defaultAscending = false,
  onRowClick,
  loading,
  emptyState,
  minWidthClassName = 'min-w-[640px]',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [ascending, setAscending] = useState(defaultAscending);

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey && c.sortValue);
    if (!column?.sortValue) return rows;
    const direction = ascending ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (left === null) return 1;
      if (right === null) return -1;
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left).localeCompare(String(right), 'fr') * direction;
      }
      return (left - right) * direction;
    });
  }, [rows, columns, sortKey, ascending]);

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setAscending((value) => !value);
    } else {
      setSortKey(key);
      setAscending(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return <>{emptyState}</>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table className={minWidthClassName}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              const isSorted = column.key === sortKey && Boolean(column.sortValue);
              return (
                <TableHead
                  key={column.key}
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wide',
                    column.align === 'right' && 'text-right',
                    column.className
                  )}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                        isSorted && 'text-foreground'
                      )}
                    >
                      {column.header}
                      {isSorted &&
                        (ascending ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        ))}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && 'cursor-pointer')}
            >
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    column.align === 'right' && 'text-right tabular-nums',
                    column.className
                  )}
                >
                  {column.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
