/**
 * Dernière étape : note du chef (facultative), récap, puis publication
 * ou conservation en brouillon.
 */
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UseOnboardingStateReturn } from '../useOnboardingState';

const NOTE_MAX = 300;

export function ChefNoteStep({ state }: { state: UseOnboardingStateReturn }) {
  const { editor, groups, isFinalizing } = state;
  const itemCount = editor.items.length;
  const categoryCount = new Set(editor.items.map((it) => it.category_id)).size;
  const groupLabel = (n: number, singular: string, plural: string) =>
    `${n} ${n > 1 ? plural : singular}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Dernière touche
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-foreground">Un mot du chef ?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Affiché sur le menu public du jour. Facultatif.
          </p>
        </div>

        <div>
          <textarea
            value={editor.chefNote}
            onChange={(e) => editor.setChefNote(e.target.value.slice(0, NOTE_MAX))}
            placeholder="Ex. : Aujourd'hui, un plat mijoté comme à la maison…"
            rows={3}
            className="w-full resize-none rounded-xl border border-input bg-background p-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/40"
          />
          <p className="mt-0.5 text-right text-[11px] text-muted-foreground">
            {editor.chefNote.length}/{NOTE_MAX}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">
            {groupLabel(itemCount, 'plat', 'plats')} ·{' '}
            {groupLabel(categoryCount, 'catégorie', 'catégories')}
            <span className="font-normal text-muted-foreground"> sur {groups.length}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Publier rend le menu visible par les étudiants. En brouillon, il reste modifiable depuis
            le calendrier.
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-2 border-t border-border bg-background px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:flex-row sm:items-center">
        <Button
          variant="outline"
          onClick={() => state.saveAndExit()}
          disabled={isFinalizing}
          className="h-12 flex-1 rounded-xl sm:h-10 sm:flex-none"
        >
          Garder en brouillon
        </Button>
        <div className="hidden flex-1 sm:block" />
        <Button
          onClick={() => state.publish()}
          disabled={isFinalizing || itemCount === 0}
          className="h-12 flex-1 gap-1.5 rounded-xl sm:h-10 sm:flex-none"
        >
          {isFinalizing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Publier le menu
        </Button>
      </div>
    </div>
  );
}
