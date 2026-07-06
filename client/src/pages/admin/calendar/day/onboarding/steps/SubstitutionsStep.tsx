/**
 * Fin de catégorie : plats de substitution optionnels (max 3), skipables
 * en un tap. Réutilise SubstitutionsSection (même UI que le popover
 * "En cas de rupture ?" du calendrier).
 */
import { ArrowLeftRight, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SubstitutionsSection } from '../../SubstitutionsSection';
import type { UseOnboardingStateReturn } from '../useOnboardingState';

export function SubstitutionsStep({ state }: { state: UseOnboardingStateReturn }) {
    const { currentGroup, editor } = state;
    if (!currentGroup) return null;

    const hasSubs = (editor.substitutions[currentGroup.catId] ?? []).length > 0;
    const isLastGroup = state.step.kind === 'category' && state.step.groupIdx === state.groups.length - 1;

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 space-y-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500 flex items-center gap-1.5">
                        <ArrowLeftRight className="w-3 h-3" />
                        En cas de rupture
                    </p>
                    <h2 className="text-lg font-semibold text-foreground mt-0.5">
                        Des substitutions pour {currentGroup.category.label.toLowerCase()} ?
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Jusqu'à 3 plats de secours, affichés automatiquement si un plat est
                        marqué en rupture pendant le service. Facultatif.
                    </p>
                </div>

                <div className="rounded-2xl border border-border bg-card p-3">
                    <SubstitutionsSection categoryId={currentGroup.catId} editor={editor} />
                </div>
            </div>

            <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border bg-background pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                <Button variant="ghost" onClick={state.goBack} className="rounded-xl h-12 sm:h-10">Retour</Button>
                <div className="flex-1" />
                {hasSubs ? (
                    <Button onClick={state.confirmSubstitutionsAndNext} className="gap-1.5 rounded-xl h-12 sm:h-10">
                        {isLastGroup ? 'Continuer' : 'Catégorie suivante'}
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                ) : (
                    <Button variant="ghost" onClick={state.confirmSubstitutionsAndNext} className="gap-1.5 rounded-xl text-muted-foreground h-12 sm:h-10">
                        Passer
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}
