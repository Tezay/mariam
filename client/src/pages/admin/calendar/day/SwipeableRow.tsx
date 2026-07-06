import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { motion, useMotionValue, useTransform, animate, type PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';

// ── Réglages du geste (aucune valeur dispersée dans la logique) ──────────────
const COMMIT_THRESHOLD = 72;   // px pour valider l'action
const MAX_REVEAL = 104;        // largeur max révélée d'un panneau
const HINT_PEEK = 46;          // px de l'indice (positif = révèle le panneau gauche)
const HINT_DELAY_MS = 500;     // délai avant de jouer l'indice
const SPRING = { type: 'spring', stiffness: 500, damping: 40 } as const;

export interface SwipeAction {
    icon: ReactNode;
    label: string;
    /** classes du panneau (fond + texte) */
    className: string;
    onTrigger: () => void;
    /** 'destructive' → la carte sort de l'écran ; 'toggle' → retour élastique */
    variant: 'destructive' | 'toggle';
}

interface SwipeableRowProps {
    children: ReactNode;
    /** Révélé en glissant vers la droite (panneau à gauche). */
    left?: SwipeAction;
    /** Révélé en glissant vers la gauche (panneau à droite). */
    right?: SwipeAction;
    hint?: boolean;
    disabled?: boolean;
    radiusClassName?: string;
}

export function SwipeableRow({ children, left, right, hint, disabled, radiusClassName = 'rounded-2xl' }: SwipeableRowProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);

    // Largeurs des panneaux qui suivent le doigt (style notifications iOS)
    const leftWidth = useTransform(x, v => Math.max(0, Math.min(v, MAX_REVEAL)));
    const rightWidth = useTransform(x, v => Math.max(0, Math.min(-v, MAX_REVEAL)));
    const leftOpacity = useTransform(x, [0, COMMIT_THRESHOLD], [0, 1]);
    const rightOpacity = useTransform(x, [0, -COMMIT_THRESHOLD], [0, 1]);
    const leftScale = useTransform(x, [0, COMMIT_THRESHOLD], [0.6, 1]);
    const rightScale = useTransform(x, [0, -COMMIT_THRESHOLD], [0.6, 1]);

    // Indice discret : révèle brièvement un panneau puis revient
    useEffect(() => {
        if (!hint || disabled) return;
        const t = setTimeout(() => {
            animate(x, HINT_PEEK, { ...SPRING, damping: 26, onComplete: () => animate(x, 0, SPRING) });
        }, HINT_DELAY_MS);
        return () => clearTimeout(t);
    }, [hint, disabled, x]);

    const handleDragEnd = (_: unknown, info: PanInfo) => {
        const off = info.offset.x;

        if (right && off < -COMMIT_THRESHOLD) {
            if (right.variant === 'destructive') {
                const w = containerRef.current?.offsetWidth ?? 400;
                animate(x, -w, { duration: 0.18, ease: 'easeIn', onComplete: right.onTrigger });
            } else {
                right.onTrigger();
                animate(x, 0, SPRING);
            }
            return;
        }
        if (left && off > COMMIT_THRESHOLD) {
            if (left.variant === 'destructive') {
                const w = containerRef.current?.offsetWidth ?? 400;
                animate(x, w, { duration: 0.18, ease: 'easeIn', onComplete: left.onTrigger });
            } else {
                left.onTrigger();
                animate(x, 0, SPRING);
            }
            return;
        }
        animate(x, 0, SPRING);
    };

    return (
        <div ref={containerRef} className="relative">
            {/* Panneau gauche (glisser à droite) */}
            {left && (
                <motion.div
                    aria-hidden
                    style={{ width: leftWidth }}
                    className={cn('absolute inset-y-1 left-1 flex items-center justify-start pl-3 gap-2 overflow-hidden whitespace-nowrap shadow-inner', radiusClassName, left.className)}
                >
                    <motion.span style={{ opacity: leftOpacity, scale: leftScale }} className="flex items-center gap-1.5 text-xs font-semibold">
                        {left.icon}
                        {left.label}
                    </motion.span>
                </motion.div>
            )}

            {/* Panneau droit (glisser à gauche) */}
            {right && (
                <motion.div
                    aria-hidden
                    style={{ width: rightWidth }}
                    className={cn('absolute inset-y-1 right-1 flex items-center justify-end pr-3 gap-2 overflow-hidden whitespace-nowrap shadow-inner', radiusClassName, right.className)}
                >
                    <motion.span style={{ opacity: rightOpacity, scale: rightScale }} className="flex items-center gap-1.5 text-xs font-semibold">
                        {right.label}
                        {right.icon}
                    </motion.span>
                </motion.div>
            )}

            {/* Contenu déplaçable */}
            <motion.div
                drag={disabled ? false : 'x'}
                dragConstraints={{ left: -MAX_REVEAL, right: MAX_REVEAL }}
                dragElastic={0.12}
                dragMomentum={false}
                style={{ x, touchAction: 'pan-y' }}
                onDragEnd={handleDragEnd}
                className="relative z-10"
            >
                {children}
            </motion.div>
        </div>
    );
}
