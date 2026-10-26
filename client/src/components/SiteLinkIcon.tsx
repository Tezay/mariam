import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LinkKind } from '@/lib/site-profile';

/** A link's logo, drawn as a mask so that it takes the colour of the text around it. */
export function SiteLinkIcon({ kind, className }: { kind: LinkKind; className?: string }) {
  if (kind === 'website') return <Globe aria-hidden className={cn('h-4 w-4', className)} />;
  const mask = `url(/links/${kind}.svg) center / contain no-repeat`;
  return (
    <span
      aria-hidden
      className={cn('inline-block h-4 w-4 shrink-0 bg-current', className)}
      style={{ mask, WebkitMask: mask }}
    />
  );
}
