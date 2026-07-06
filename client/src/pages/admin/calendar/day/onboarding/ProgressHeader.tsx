/**
 * En-tête du wizard : retour, progression segmentée par catégorie
 * (couleurs de catégorie), fermeture.
 */
import { ArrowLeft, X } from 'lucide-react';
import { getCategoryColor } from '@/lib/category-colors';
import { cn } from '@/lib/utils';
import type { CatGroup, OnboardingStep } from './types';

interface ProgressHeaderProps {
    groups: CatGroup[];
    step: OnboardingStep;
    canGoBack: boolean;
    onBack: () => void;
    onClose: () => void;
}

export function ProgressHeader({ groups, step, canGoBack, onBack, onClose }: ProgressHeaderProps) {
    const activeIdx = step.kind === 'category' ? step.groupIdx : groups.length;

    return (
        <header className="shrink-0 flex items-center gap-3 px-3 sm:px-4 h-12 border-b border-border bg-background">
            <button
                type="button"
                onClick={onBack}
                disabled={!canGoBack}
                aria-label="Retour"
                className={cn(
                    'shrink-0 rounded-xl p-1.5 text-muted-foreground transition-colors',
                    canGoBack ? 'hover:bg-muted hover:text-foreground' : 'opacity-0 pointer-events-none',
                )}
            >
                <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex-1 flex items-center gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={groups.length} aria-valuenow={Math.min(activeIdx, groups.length)}>
                {groups.map((group, idx) => {
                    const color = getCategoryColor(group.category.color_key, idx);
                    const done = idx < activeIdx;
                    const active = idx === activeIdx;
                    return (
                        <span
                            key={group.catId}
                            title={group.category.label}
                            className={cn(
                                'flex-1 rounded-full transition-all duration-300',
                                active ? 'h-2' : 'h-1.5',
                                !done && !active && 'bg-muted',
                            )}
                            style={done || active
                                ? { backgroundColor: color.bg, opacity: done ? 0.45 : 1 }
                                : undefined}
                        />
                    );
                })}
            </div>

            <button
                type="button"
                onClick={onClose}
                aria-label="Quitter la création du menu"
                className="shrink-0 rounded-xl p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </header>
    );
}
