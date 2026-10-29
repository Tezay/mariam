import { cn } from '@/lib/utils';

const TONES = {
  info: 'border-site-brand/20 bg-site-brand-soft text-site-brand',
  warning: 'border-site-note-line bg-site-note text-site-note-text',
  success: 'border-site-ok/30 bg-site-ok-soft text-site-ok',
  danger: 'border-site-danger-line bg-site-danger-soft text-site-danger',
};

export function Notice({
  icon,
  title,
  tone = 'info',
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: keyof typeof TONES;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-2xl border p-4', TONES[tone])}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 shrink-0">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {children && <div className="mt-1 text-sm opacity-90">{children}</div>}
        </div>
      </div>
    </div>
  );
}
