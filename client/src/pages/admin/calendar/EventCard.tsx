import { Pencil } from 'lucide-react';
import type { Event } from '@/lib/api';

interface EventCardProps {
    event: Event;
    compact?: boolean;
    onEdit?: (event: Event) => void;
}

export function EventCard({ event, compact = false, onEdit }: EventCardProps) {
    const color = event.color ?? '#10b981';

    if (compact) {
        return (
            <button
                type="button"
                onClick={() => onEdit?.(event)}
                className="w-full flex items-center gap-1.5 px-2 py-1 rounded-xl text-left transition-opacity hover:opacity-80"
                style={{
                    backgroundColor: color + '18',
                    border: `1px solid ${color}40`,
                }}
            >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[10px] font-semibold truncate flex-1" style={{ color }}>
                    {event.title}
                </span>
                {onEdit && <Pencil className="w-2.5 h-2.5 shrink-0" style={{ color }} />}
            </button>
        );
    }

    const image = event.images?.[0] ?? null;

    return (
        <div
            className="rounded-2xl p-3 flex gap-3"
            style={{
                backgroundColor: color + '12',
                borderLeft: `3px solid ${color}`,
            }}
        >
            {/* Image gauche */}
            {image && (
                <img
                    src={image.url}
                    alt={event.title}
                    className="w-16 h-16 rounded-xl object-cover shrink-0"
                />
            )}

            {/* Contenu */}
            <div className="flex-1 min-w-0">
                {/* Badge Événement */}
                <span
                    className="inline-block text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 mb-1.5"
                    style={{
                        color,
                        backgroundColor: color + '18',
                        border: `1px solid ${color}30`,
                    }}
                >
                    Événement
                </span>

                <p className="text-sm font-bold leading-snug" style={{ color }}>
                    {event.title}
                </p>
                {event.subtitle && (
                    <p className="text-xs mt-0.5 opacity-70" style={{ color }}>
                        {event.subtitle}
                    </p>
                )}

                {onEdit && (
                    <button
                        type="button"
                        onClick={() => onEdit(event)}
                        className="flex items-center gap-1 text-xs font-medium mt-1.5 opacity-70 hover:opacity-100 transition-opacity"
                        style={{ color }}
                    >
                        <Pencil className="w-3 h-3" />
                        Modifier
                    </button>
                )}
            </div>
        </div>
    );
}
