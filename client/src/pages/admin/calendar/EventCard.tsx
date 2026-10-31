import { Pencil } from 'lucide-react';
import type { News } from '@/lib/api/news';

interface EventCardProps {
  event: News;
  compact?: boolean;
  onEdit?: (event: News) => void;
}

export function EventCard({ event, compact = false, onEdit }: EventCardProps) {
  const color = event.color ?? '#10b981';

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onEdit?.(event)}
        className="flex w-full items-center gap-1.5 rounded-xl px-2 py-1 text-left transition-opacity hover:opacity-80"
        style={{
          backgroundColor: color + '18',
          border: `1px solid ${color}40`,
        }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="flex-1 truncate text-[10px] font-semibold" style={{ color }}>
          {event.title}
        </span>
        {onEdit && <Pencil className="h-2.5 w-2.5 shrink-0" style={{ color }} />}
      </button>
    );
  }

  const image = event.images?.[0] ?? null;

  return (
    <div
      className="flex gap-3 rounded-2xl p-3"
      style={{
        backgroundColor: color + '12',
        borderLeft: `3px solid ${color}`,
      }}
    >
      {image && (
        <img
          src={image.url}
          alt={event.title}
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
        />
      )}

      <div className="min-w-0 flex-1">
        <span
          className="mb-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
          style={{
            color,
            backgroundColor: color + '18',
            border: `1px solid ${color}30`,
          }}
        >
          Actualité
        </span>

        <p className="text-sm font-bold leading-snug" style={{ color }}>
          {event.title}
        </p>
        {event.summary && (
          <p className="mt-0.5 text-xs opacity-70" style={{ color }}>
            {event.summary}
          </p>
        )}

        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(event)}
            className="mt-1.5 flex items-center gap-1 text-xs font-medium opacity-70 transition-opacity hover:opacity-100"
            style={{ color }}
          >
            <Pencil className="h-3 w-3" />
            Modifier
          </button>
        )}
      </div>
    </div>
  );
}
