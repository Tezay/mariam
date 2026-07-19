/**
 * Confirmation d'ajout : check animé, hint photo discret pour un plat sans
 * image, puis "ajouter un autre" ou passer à la suite.
 */
import { Check, Camera, Plus, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { getCategoryColor } from '@/lib/category-colors';
import { Button } from '@/components/ui/button';
import type { UseOnboardingStateReturn } from '../useOnboardingState';

const ENCOURAGEMENTS = ['Ajouté !', 'Et un de plus !', 'Ça prend forme !', 'Parfait !'];

export function ItemAddedStep({ state }: { state: UseOnboardingStateReturn }) {
  const { activeDish, currentGroup, editor } = state;
  const reducedMotion = useReducedMotion();

  const groupIdx = state.step.kind === 'category' ? state.step.groupIdx : 0;
  const color = getCategoryColor(currentGroup?.category.color_key, groupIdx);
  const isLastGroup = groupIdx === state.groups.length - 1;
  const encouragement = ENCOURAGEMENTS[editor.items.length % ENCOURAGEMENTS.length];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-4 pt-8 text-center">
        <motion.div
          initial={reducedMotion ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color.bg}26`, color: color.sectionLabel }}
        >
          <Check className="h-7 w-7" strokeWidth={3} />
        </motion.div>

        <div>
          <p className="text-base font-semibold text-foreground">{encouragement}</p>
          {activeDish && (
            <motion.div
              initial={reducedMotion ? false : { scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: 'spring',
                stiffness: 320,
                damping: 20,
                delay: 0.08,
              }}
              className="mt-3 inline-flex rounded-2xl px-5 py-2.5 text-base font-bold"
              style={{
                backgroundColor: color.bg,
                color: color.label,
                borderBottom: `4px solid ${color.border}`,
              }}
            >
              {activeDish.name}
            </motion.div>
          )}
        </div>

        {/* Hint photo discret pour un plat sans image */}
        {activeDish && !activeDish.image_url && (
          <button
            type="button"
            onClick={() => state.openPhotoStep(activeDish)}
            className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Camera className="h-3.5 w-3.5" />
            Ajouter une photo ? Mettez en avant vos plats !
          </button>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-2 border-t border-border bg-background px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:flex-row sm:items-center">
        <Button
          variant="outline"
          onClick={state.addAnother}
          className="h-14 flex-1 gap-1.5 rounded-xl text-[15px] sm:h-10 sm:flex-none sm:text-sm"
        >
          <Plus className="h-4 w-4" />
          Ajouter un autre plat
        </Button>
        <div className="hidden flex-1 sm:block" />
        <Button
          onClick={state.finishCategory}
          className="h-14 flex-1 gap-1.5 rounded-xl text-[15px] sm:h-10 sm:flex-none sm:text-sm"
        >
          {isLastGroup ? 'Terminer les catégories' : 'Catégorie suivante'}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
