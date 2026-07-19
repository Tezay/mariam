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
    <div className="absolute bottom-0 right-2 z-20 flex translate-y-1/3 items-center gap-1 rounded-full border border-gray-200 bg-white px-1 py-1.5 shadow-sm dark:border-border dark:bg-card">
      {tags.map((tag) => (
        <span
          key={tag.id}
          title={tag.label}
          className="flex h-4 w-4 items-center justify-center rounded-full"
          style={{ backgroundColor: tag.color + '22' }}
        >
          <Icon name={tag.icon as IconName} className="h-2.5 w-2.5" style={{ color: tag.color }} />
        </span>
      ))}

      {tags.length > 0 && certs.length > 0 && (
        <span className="mx-0.5 h-3 w-px shrink-0 bg-gray-200 dark:bg-border" />
      )}

      {certs.map((cert) => (
        <span key={cert.id} title={cert.name} className="flex h-4 w-4 items-center justify-center">
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
