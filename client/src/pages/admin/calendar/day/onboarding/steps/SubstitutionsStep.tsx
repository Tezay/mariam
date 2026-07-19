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
  const isLastGroup =
    state.step.kind === 'category' && state.step.groupIdx === state.groups.length - 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-4">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-orange-500">
            <ArrowLeftRight className="h-3 w-3" />
            En cas de rupture
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-foreground">
            Des substitutions pour {currentGroup.category.label.toLowerCase()} ?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Jusqu'à 3 plats de secours, affichés automatiquement si un plat est marqué en rupture
            pendant le service. Facultatif.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3">
          <SubstitutionsSection categoryId={currentGroup.catId} editor={editor} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-background px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <Button variant="ghost" onClick={state.goBack} className="h-12 rounded-xl sm:h-10">
          Retour
        </Button>
        <div className="flex-1" />
        {hasSubs ? (
          <Button
            onClick={state.confirmSubstitutionsAndNext}
            className="h-12 gap-1.5 rounded-xl sm:h-10"
          >
            {isLastGroup ? 'Continuer' : 'Catégorie suivante'}
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={state.confirmSubstitutionsAndNext}
            className="h-12 gap-1.5 rounded-xl text-muted-foreground sm:h-10"
          >
            Passer
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
