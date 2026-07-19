/**
 * Menu publié : célébration légère (canvas-confetti chargé à la demande,
 * désactivé si prefers-reduced-motion) puis retour au calendrier.
 */
import { useEffect } from 'react';
import { PartyPopper } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import type { UseOnboardingStateReturn } from '../useOnboardingState';

export function CelebrationStep({
  state,
  dateLabel,
}: {
  state: UseOnboardingStateReturn;
  dateLabel: string;
}) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    import('canvas-confetti')
      .then(({ default: confetti }) => {
        if (cancelled) return;
        confetti({
          particleCount: 90,
          spread: 70,
          startVelocity: 38,
          origin: { y: 0.7 },
          disableForReducedMotion: true,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reducedMotion]);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <motion.div
        initial={reducedMotion ? false : { scale: 0.4, opacity: 0, rotate: -12 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 16 }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <PartyPopper className="h-8 w-8" />
      </motion.div>
      <div>
        <h2 className="text-xl font-semibold text-foreground">Menu publié !</h2>
        <p className="mt-1 text-sm capitalize text-muted-foreground">{dateLabel}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Il est maintenant visible par les étudiants sur l'affichage public.
        </p>
      </div>
      <Button onClick={state.exitAfterCelebration} className="mt-2 rounded-xl">
        Retour au calendrier
      </Button>
    </div>
  );
}
