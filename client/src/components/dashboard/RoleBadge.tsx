import { roleIcon, roleLabel } from '@/lib/roles';
import { cn } from '@/lib/utils';

export function RoleBadge({ role, className }: { role: string | undefined; className?: string }) {
  const Icon = roleIcon(role);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground',
        className
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />}
      {roleLabel(role)}
    </span>
  );
}
