import { Download, FolderInput, Scale, Tags, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { canCompare } from '../rules';

export interface BulkActions {
  askDelete: () => void;
  askMove: () => void;
  askLabels: () => void;
  download: () => void;
}

function Action({
  icon: ActionIcon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: typeof Scale;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors disabled:opacity-40',
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-muted disabled:hover:bg-transparent'
      )}
    >
      <ActionIcon className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function BulkBar({
  count,
  actions,
  onClear,
  onCompare,
}: {
  count: number;
  actions: BulkActions;
  onClear: () => void;
  onCompare: () => void;
}) {
  return (
    <div className="sticky bottom-4 z-20 mx-auto w-fit max-w-full overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-lg">
      <div className="flex items-center gap-1">
        <span
          title={`${count} sélectionnés`}
          className="px-2 text-sm tabular-nums text-muted-foreground"
        >
          {count}
          <span className="hidden sm:inline"> sélectionné{count > 1 ? 's' : ''}</span>
        </span>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Action icon={Scale} label="Comparer" onClick={onCompare} disabled={!canCompare(count)} />
        <Action
          icon={FolderInput}
          label="Catégorie"
          onClick={actions.askMove}
          disabled={count === 0}
        />
        <Action icon={Tags} label="Labels" onClick={actions.askLabels} disabled={count === 0} />
        <Action
          icon={Download}
          label="Exporter"
          onClick={actions.download}
          disabled={count === 0}
        />
        <Action
          icon={Trash2}
          label="Supprimer"
          onClick={actions.askDelete}
          disabled={count === 0}
          destructive
        />
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <button
          type="button"
          onClick={onClear}
          aria-label="Quitter la sélection"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
