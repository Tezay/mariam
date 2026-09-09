import { cn } from '@/lib/utils';

/**
 * Backdrop and reading column for the public pages.
 *
 * The backdrop must stay full-bleed and light: the column alone would let the
 * body show through on the sides, and the body follows the admin dark theme.
 * The column stops growing because these pages keep the mobile layout up to the
 * TV breakpoint, where full-width cards become unreadable.
 */
export function PublicShell({
  children,
  size = 'wide',
  className,
}: {
  children: React.ReactNode;
  size?: 'narrow' | 'wide';
  className?: string;
}) {
  return (
    <div className="min-h-screen w-full bg-gray-100">
      <div
        className={cn(
          'mx-auto flex min-h-screen w-full flex-col bg-gray-50 lg:border-x lg:border-gray-200',
          size === 'narrow' ? 'max-w-2xl' : 'max-w-3xl',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
