/**
 * Wizard de création de menu (mobile-first).
 *
 * Overlay plein écran (couvre sidebar et navbars — mode immersif), boucle par
 * catégorie avec étapes tags/photo/substitutions, aperçu du menu en continu
 * (panel desktop, drawer mobile), auto-save du brouillon, dialogue de sortie
 * à trois choix.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { MenuCategory, DishCatalogItem } from '@/lib/api';
import { getCategoryColor } from '@/lib/category-colors';
import { useSidebar } from '@/contexts/SidebarContext';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useOnboardingState } from './useOnboardingState';
import { useFlyToPreview } from './useFlyToPreview';
import { useVisualViewportHeight } from './useVisualViewportHeight';
import { ProgressHeader } from './ProgressHeader';
import { MenuPreviewPanel } from './MenuPreviewPanel';
import { MenuPreviewDrawer } from './MenuPreviewDrawer';
import { ItemPickStep } from './steps/ItemPickStep';
import { TagsStep } from './steps/TagsStep';
import { PhotoStep } from './steps/PhotoStep';
import { ItemAddedStep } from './steps/ItemAddedStep';
import { SubstitutionsStep } from './steps/SubstitutionsStep';
import { ChefNoteStep } from './steps/ChefNoteStep';
import { CelebrationStep } from './steps/CelebrationStep';

interface MenuOnboardingWizardProps {
    date: string;
    restaurantId: number | undefined;
    categories: MenuCategory[];
    /** Fermé après une action qui a pu modifier les données (refresh conseillé). */
    onDone: () => void;
    /** Fermé sans qu'aucune donnée n'ait été créée. */
    onCancel: () => void;
}

export function MenuOnboardingWizard({ date, restaurantId, categories, onDone, onCancel }: MenuOnboardingWizardProps) {
    const { setImmersive } = useSidebar();
    const [exitDialogOpen, setExitDialogOpen] = useState(false);

    const state = useOnboardingState({
        date,
        restaurantId,
        categories,
        onExit: () => onDone(),
    });
    const { editor, step } = state;

    const { fly, registerTarget, overlay } = useFlyToPreview();
    const { height, keyboardOpen } = useVisualViewportHeight();

    // Mode immersif : navbar mobile masquée pendant tout l'onboarding
    useEffect(() => {
        setImmersive(true);
        return () => setImmersive(false);
    }, [setImmersive]);

    const dateLabel = useMemo(
        () => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
            .format(new Date(`${date}T12:00:00`)),
        [date],
    );

    const handleSelectWithFly = (dish: DishCatalogItem, sourceEl: HTMLElement | null) => {
        const groupIdx = step.kind === 'category' ? step.groupIdx : 0;
        const color = getCategoryColor(state.currentGroup?.category.color_key, groupIdx);
        fly(sourceEl, dish.name, color);
        state.selectExistingDish(dish);
    };

    const handleRequestClose = () => {
        // Rien créé ni modifié → fermeture directe
        if (!editor.menuId && editor.items.length === 0 && !editor.isDirty) {
            onCancel();
            return;
        }
        setExitDialogOpen(true);
    };

    const stepKey = step.kind === 'category' ? `${step.groupIdx}-${step.sub}` : step.kind;
    const isEmpty = editor.items.length === 0;

    return (
        <div
            className={cn('fixed inset-0 z-40 bg-background flex flex-col', height === null && 'h-[100dvh]')}
            style={height !== null ? { height } : undefined}
        >
            {step.kind !== 'celebration' && (
                <ProgressHeader
                    groups={state.groups}
                    step={step}
                    canGoBack={state.canGoBack}
                    onBack={state.goBack}
                    onClose={handleRequestClose}
                />
            )}

            <div className="flex-1 min-h-0 flex">
                {/* Colonne wizard */}
                <div className="flex-1 min-w-0 flex flex-col">
                    {state.isBootstrapping ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-primary animate-spin" />
                        </div>
                    ) : (
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={stepKey}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.18 }}
                                className="flex-1 min-h-0 flex flex-col"
                            >
                                {step.kind === 'category' && step.sub === 'pick' && (
                                    <ItemPickStep state={state} keyboardOpen={keyboardOpen} onSelectWithFly={handleSelectWithFly} />
                                )}
                                {step.kind === 'category' && step.sub === 'tags' && <TagsStep state={state} />}
                                {step.kind === 'category' && step.sub === 'photo' && <PhotoStep state={state} />}
                                {step.kind === 'category' && step.sub === 'added' && <ItemAddedStep state={state} />}
                                {step.kind === 'category' && step.sub === 'substitutions' && <SubstitutionsStep state={state} />}
                                {step.kind === 'chef-note' && <ChefNoteStep state={state} />}
                                {step.kind === 'celebration' && <CelebrationStep state={state} dateLabel={dateLabel} />}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>

                {/* Aperçu desktop */}
                {step.kind !== 'celebration' && (
                    <MenuPreviewPanel
                        groups={state.groups}
                        editor={editor}
                        dateLabel={dateLabel}
                        flyTargetRef={registerTarget('panel')}
                    />
                )}
            </div>

            {/* Aperçu mobile (poignée + drawer) */}
            {step.kind !== 'celebration' && !state.isBootstrapping && (
                <MenuPreviewDrawer
                    groups={state.groups}
                    editor={editor}
                    dateLabel={dateLabel}
                    hidden={keyboardOpen}
                    flyTargetRef={registerTarget('drawer')}
                />
            )}

            {overlay}

            {/* Dialogue de sortie — trois choix */}
            <AlertDialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Quitter la création du menu ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {isEmpty
                                ? 'Le menu est vide pour le moment.'
                                : `${editor.items.length} plat${editor.items.length > 1 ? 's' : ''} déjà ajouté${editor.items.length > 1 ? 's' : ''}. Vous pouvez garder ce brouillon et le reprendre plus tard depuis le calendrier.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col sm:flex-col gap-2">
                        {!isEmpty && (
                            <AlertDialogAction
                                onClick={() => { setExitDialogOpen(false); state.saveAndExit(); }}
                                className="rounded-xl w-full"
                            >
                                Garder en brouillon
                            </AlertDialogAction>
                        )}
                        <AlertDialogAction
                            onClick={() => { setExitDialogOpen(false); state.discardAndExit(); }}
                            className={cn(
                                'rounded-xl w-full',
                                isEmpty
                                    ? undefined
                                    : 'bg-transparent border border-border text-destructive hover:bg-destructive/10',
                            )}
                        >
                            Tout oublier
                        </AlertDialogAction>
                        <AlertDialogCancel className="rounded-xl w-full mt-0">Rester</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
