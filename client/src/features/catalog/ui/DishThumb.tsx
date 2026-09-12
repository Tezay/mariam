import { Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DishThumb({ url, className }: { url: string | null; className?: string }) {
  if (url) {
    return <img src={url} alt="" className={cn('shrink-0 rounded-lg object-cover', className)} />;
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
        className
      )}
    >
      <Utensils className="h-1/2 w-1/2" />
    </span>
  );
}
