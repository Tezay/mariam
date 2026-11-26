import { cn } from '@/lib/utils';
import type { Badge, Tone } from './subscription-view';

const TONES: Record<Tone, { pill: string; dot: string }> = {
  trial: {
    pill: 'bg-[#F5A524]/15 text-[#8C5A00] dark:text-[#F5A524]',
    dot: 'bg-[#F5A524]',
  },
  active: {
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  soon: {
    pill: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  expired: {
    pill: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  muted: { pill: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/50' },
};

export function SubscriptionBadge({ badge, className }: { badge: Badge; className?: string }) {
  const tone = TONES[badge.tone];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone.pill,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
      {badge.label}
    </span>
  );
}
