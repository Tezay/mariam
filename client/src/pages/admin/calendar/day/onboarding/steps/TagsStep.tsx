/**
 * Qualification d'un nouveau plat : tags alimentaires et certifications.
 * La validation crée immédiatement le plat au catalogue (puis étape photo).
 */
import { ChevronRight, Loader2 } from 'lucide-react';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UseOnboardingStateReturn } from '../useOnboardingState';

export function TagsStep({ state }: { state: UseOnboardingStateReturn }) {
    const { pendingDish, tagConfig, isCreatingDish } = state;
    if (!pendingDish) return null;

    const hasConfig = tagConfig.dietary_tags.length > 0 || tagConfig.certifications.length > 0;

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 space-y-5">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nouveau plat</p>
                    <h2 className="text-lg font-semibold text-foreground mt-0.5 break-words">{pendingDish.name}</h2>
                    {hasConfig && (
                        <p className="text-sm text-muted-foreground mt-1">Des particularités à signaler ? (facultatif)</p>
                    )}
                </div>

                {hasConfig ? (
                    <div className="space-y-5">
                        {tagConfig.dietary_tags.length > 0 && (
                            <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags alimentaires</p>
                                <div className="flex flex-wrap gap-2">
                                    {tagConfig.dietary_tags.map(tag => {
                                        const selected = pendingDish.tags.some(t => t.id === tag.id);
                                        return (
                                            <button
                                                key={tag.id}
                                                type="button"
                                                onClick={() => state.togglePendingTag(tag)}
                                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all active:scale-[0.97]"
                                                style={{
                                                    backgroundColor: tag.color + (selected ? '33' : '11'),
                                                    color: tag.color,
                                                    borderColor: tag.color + (selected ? 'AA' : '44'),
                                                    ...(selected ? { outline: `2px solid ${tag.color}`, outlineOffset: '1px' } : {}),
                                                }}
                                            >
                                                <Icon name={tag.icon as IconName} className="w-3.5 h-3.5" style={{ color: tag.color }} />
                                                {tag.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {tagConfig.certifications.length > 0 && (
                            <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Certifications</p>
                                <div className="flex flex-wrap gap-2">
                                    {tagConfig.certifications.map(cert => {
                                        const selected = pendingDish.certifications.some(c => c.id === cert.id);
                                        return (
                                            <button
                                                key={cert.id}
                                                type="button"
                                                onClick={() => state.togglePendingCert(cert)}
                                                className={cn(
                                                    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all active:scale-[0.97]',
                                                    selected
                                                        ? 'bg-primary/10 text-primary border-primary/50 outline outline-2 outline-primary outline-offset-1'
                                                        : 'bg-muted/50 text-muted-foreground border-border',
                                                )}
                                            >
                                                <img src={`/certifications/${cert.logo_filename}`} alt={cert.name} className="h-3.5 w-3.5 object-contain" />
                                                {cert.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Aucun tag configuré pour ce restaurant.</p>
                )}
            </div>

            <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border bg-background pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                <Button variant="ghost" onClick={state.goBack} disabled={isCreatingDish} className="rounded-xl h-12 sm:h-10">
                    Retour
                </Button>
                <div className="flex-1" />
                <Button onClick={() => state.confirmNewDishTags()} disabled={isCreatingDish} className="gap-1.5 rounded-xl min-w-28 h-12 sm:h-10">
                    {isCreatingDish ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <>
                            {pendingDish.tags.length + pendingDish.certifications.length > 0 ? 'Valider' : 'Aucun tag'}
                            <ChevronRight className="w-4 h-4" />
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
