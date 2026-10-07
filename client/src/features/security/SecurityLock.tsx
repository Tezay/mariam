/**
 * Keeps the account's security settings behind « Déverrouiller » until the
 * session is confirmed, and again by itself once the confirmation lapses.
 *
 * Blurred, not hidden: the lock guards what these controls do, which the server
 * refuses anyway, not what they show.
 */
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIdentityConfirmed, useStepUp } from '@/hooks/useStepUp';
import { cn } from '@/lib/utils';

export function SecurityLock({ children }: { children: ReactNode }) {
  const confirmIdentity = useStepUp();
  const confirmed = useIdentityConfirmed();

  return (
    <div className="relative">
      <div
        className={cn(
          'space-y-3 transition-[filter,opacity] duration-200',
          !confirmed && 'pointer-events-none select-none opacity-70 blur-sm'
        )}
        // As a string: React 18 drops the attribute when given a boolean.
        {...(!confirmed && { inert: '' })}
      >
        {children}
      </div>

      {!confirmed && (
        <div className="absolute inset-0 flex items-start justify-center px-4 pt-10">
          <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-card p-5 text-center shadow-lg">
            <Lock className="mx-auto h-5 w-5 text-primary" aria-hidden />
            <p className="text-sm text-foreground">
              Confirmez votre identité pour gérer vos méthodes de connexion.
            </p>
            <Button
              className="w-full"
              onClick={() =>
                confirmIdentity({ description: 'Pour gérer vos méthodes de connexion.' })
              }
            >
              Déverrouiller
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
