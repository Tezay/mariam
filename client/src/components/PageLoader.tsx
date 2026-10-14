import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/** Shared by every full-page wait, so the indicator stays put from one loading step to the next. */
export function PageLoader({ className }: { className?: string }) {
  return (
    <div className={cn('flex min-h-screen items-center justify-center bg-background', className)}>
      <Spinner className="size-8 text-primary" />
    </div>
  );
}
