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
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-8 flex flex-col items-center gap-4 text-center">
                <motion.div
                    initial={reducedMotion ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${color.bg}26`, color: color.sectionLabel }}
                >
                    <Check className="w-7 h-7" strokeWidth={3} />
                </motion.div>

                <div>
                    <p className="text-base font-semibold text-foreground">{encouragement}</p>
                    {activeDish && (
                        <motion.div
                            initial={reducedMotion ? false : { scale: 0.85, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.08 }}
                            className="inline-flex mt-3 rounded-2xl px-5 py-2.5 text-base font-bold"
                            style={{ backgroundColor: color.bg, color: color.label, borderBottom: `4px solid ${color.border}` }}
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
                        className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                    >
                        <Camera className="w-3.5 h-3.5" />
                        Ajouter une photo ? Mettez en avant vos plats !
                    </button>
                )}
            </div>

            <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-4 py-3 border-t border-border bg-background pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                <Button variant="outline" onClick={state.addAnother} className="gap-1.5 rounded-xl flex-1 sm:flex-none h-14 sm:h-10 text-[15px] sm:text-sm">
                    <Plus className="w-4 h-4" />
                    Ajouter un autre plat
                </Button>
                <div className="hidden sm:block flex-1" />
                <Button onClick={state.finishCategory} className="gap-1.5 rounded-xl flex-1 sm:flex-none h-14 sm:h-10 text-[15px] sm:text-sm">
                    {isLastGroup ? 'Terminer les catégories' : 'Catégorie suivante'}
                    <ChevronRight className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
