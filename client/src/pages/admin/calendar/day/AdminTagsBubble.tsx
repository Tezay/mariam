import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import type { MenuItem } from '@/lib/api';

interface AdminTagsBubbleProps {
    item: MenuItem;
    // editor and canEdit kept for API compat
    editor?: unknown;
    canEdit?: boolean;
}

export function AdminTagsBubble({ item }: AdminTagsBubbleProps) {
    const tags = item.dish?.tags ?? [];
    const certs = item.dish?.certifications ?? [];
    const hasBadges = tags.length > 0 || certs.length > 0;

    if (!hasBadges) return null;

    return (
        <div className="absolute bottom-0 right-2 translate-y-1/3 z-20 bg-white dark:bg-card rounded-full border border-gray-200 dark:border-border shadow-sm flex items-center gap-1 px-1 py-1.5">
            {tags.map(tag => (
                <span
                    key={tag.id}
                    title={tag.label}
                    className="flex items-center justify-center w-4 h-4 rounded-full"
                    style={{ backgroundColor: tag.color + '22' }}
                >
                    <Icon name={tag.icon as IconName} className="w-2.5 h-2.5" style={{ color: tag.color }} />
                </span>
            ))}

            {tags.length > 0 && certs.length > 0 && (
                <span className="w-px h-3 bg-gray-200 dark:bg-border mx-0.5 shrink-0" />
            )}

            {certs.map(cert => (
                <span
                    key={cert.id}
                    title={cert.name}
                    className="flex items-center justify-center w-4 h-4"
                >
                    <img
                        src={`/certifications/${cert.logo_filename}`}
                        alt={cert.name}
                        className="h-4 w-4 object-contain"
                    />
                </span>
            ))}
        </div>
    );
}
