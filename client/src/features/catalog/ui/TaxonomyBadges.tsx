import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import type { CertificationItem, DietaryTag } from '@/lib/api';
import { cn } from '@/lib/utils';

export function CertificationLogo({
  certification,
  className,
}: {
  certification: CertificationItem;
  className?: string;
}) {
  if (!certification.logo_filename) {
    return <span className={cn('text-[10px] uppercase', className)}>{certification.name}</span>;
  }
  return (
    <img
      src={`/certifications/${certification.logo_filename}`}
      alt=""
      title={certification.name}
      className={cn('shrink-0 object-contain', className)}
    />
  );
}

/** Icons only: the table and the identity card have no room for the names. */
export function TaxonomyBadges({
  tags,
  certifications,
  className,
}: {
  tags: DietaryTag[];
  certifications: CertificationItem[];
  className?: string;
}) {
  if (tags.length === 0 && certifications.length === 0) return null;
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {tags.map((tag) =>
        tag.icon ? (
          <Icon
            key={tag.id}
            name={tag.icon as IconName}
            aria-label={tag.label}
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
        ) : (
          <span key={tag.id} className="text-[10px] text-muted-foreground">
            {tag.label}
          </span>
        )
      )}
      {certifications.map((certification) => (
        <CertificationLogo
          key={certification.id}
          certification={certification}
          className="h-3.5 w-3.5"
        />
      ))}
    </span>
  );
}
