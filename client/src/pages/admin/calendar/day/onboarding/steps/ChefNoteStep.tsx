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
    const categoryCount = new Set(editor.items.map(it => it.category_id)).size;
    const groupLabel = (n: number, singular: string, plural: string) => `${n} ${n > 1 ? plural : singular}`;

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 space-y-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dernière touche</p>
                    <h2 className="text-lg font-semibold text-foreground mt-0.5">Un mot du chef ?</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Affiché sur le menu public du jour. Facultatif.
                    </p>
                </div>

                <div>
                    <textarea
                        value={editor.chefNote}
                        onChange={e => editor.setChefNote(e.target.value.slice(0, NOTE_MAX))}
                        placeholder="Ex. : Aujourd'hui, un plat mijoté comme à la maison…"
                        rows={3}
                        className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/40 resize-none"
                    />
                    <p className="text-right text-[11px] text-muted-foreground mt-0.5">
                        {editor.chefNote.length}/{NOTE_MAX}
                    </p>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-sm font-semibold text-foreground">
                        {groupLabel(itemCount, 'plat', 'plats')} · {groupLabel(categoryCount, 'catégorie', 'catégories')}
                        <span className="text-muted-foreground font-normal"> sur {groups.length}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Publier rend le menu visible par les étudiants. En brouillon, il reste
                        modifiable depuis le calendrier.
                    </p>
                </div>
            </div>

            <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-4 py-3 border-t border-border bg-background pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                <Button
                    variant="outline"
                    onClick={() => state.saveAndExit()}
                    disabled={isFinalizing}
                    className="rounded-xl flex-1 sm:flex-none h-12 sm:h-10"
                >
                    Garder en brouillon
                </Button>
                <div className="hidden sm:block flex-1" />
                <Button
                    onClick={() => state.publish()}
                    disabled={isFinalizing || itemCount === 0}
                    className="gap-1.5 rounded-xl flex-1 sm:flex-none h-12 sm:h-10"
                >
                    {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Publier le menu
                </Button>
            </div>
        </div>
    );
}
