import { Building2, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface SiteOption {
  id: number;
  name: string;
}

interface SitePickerProps {
  sites: SiteOption[];
  selected: number[];
  onChange: (ids: number[]) => void;
}

/**
 * Renders nothing for a single-site scope, which is what makes the analytics
 * pages identical for a lone site admin and a director.
 */
export function SitePicker({ sites, selected, onChange }: SitePickerProps) {
  if (sites.length < 2) return null;

  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
  };

  const label =
    selected.length === 0
      ? `Tous les sites (${sites.length})`
      : selected.length === 1
        ? (sites.find((s) => s.id === selected[0])?.name ?? '1 site')
        : `${selected.length} sites`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 max-w-[220px] gap-2 rounded-xl text-xs font-medium',
            selected.length > 0 && 'border-primary/40 bg-primary/10 text-primary'
          )}
        >
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sites
          </span>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-medium text-primary hover:underline"
            >
              Tout afficher
            </button>
          )}
        </div>
        <ScrollArea className="max-h-72">
          <ul className="p-1">
            {sites.map((site) => {
              const isSelected = selected.includes(site.id);
              return (
                <li key={site.id}>
                  <button
                    type="button"
                    onClick={() => toggle(site.id)}
                    aria-pressed={isSelected}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        isSelected ? 'border-primary bg-primary text-white' : 'border-input'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{site.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
