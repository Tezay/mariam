/**
 * Menu publié : célébration légère (canvas-confetti chargé à la demande,
 * désactivé si prefers-reduced-motion) puis retour au calendrier.
 */
import { useEffect } from 'react';
import { PartyPopper } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import type { UseOnboardingStateReturn } from '../useOnboardingState';

export function CelebrationStep({ state, dateLabel }: { state: UseOnboardingStateReturn; dateLabel: string }) {
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        if (reducedMotion) return;
        let cancelled = false;
        import('canvas-confetti').then(({ default: confetti }) => {
            if (cancelled) return;
            confetti({
                particleCount: 90,
                spread: 70,
                startVelocity: 38,
                origin: { y: 0.7 },
                disableForReducedMotion: true,
            });
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [reducedMotion]);

    return (
        <div className="flex flex-col flex-1 min-h-0 items-center justify-center gap-4 px-6 text-center">
            <motion.div
                initial={reducedMotion ? false : { scale: 0.4, opacity: 0, rotate: -12 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center"
            >
                <PartyPopper className="w-8 h-8" />
            </motion.div>
            <div>
                <h2 className="text-xl font-semibold text-foreground">Menu publié !</h2>
                <p className="text-sm text-muted-foreground mt-1 capitalize">{dateLabel}</p>
                <p className="text-sm text-muted-foreground mt-2">
                    Il est maintenant visible par les étudiants sur l'affichage public.
                </p>
            </div>
            <Button onClick={state.exitAfterCelebration} className="rounded-xl mt-2">
                Retour au calendrier
            </Button>
        </div>
    );
}
