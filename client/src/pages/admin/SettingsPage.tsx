/**
 * MARIAM - Page Paramètres du Restaurant
 *
 * Conteneur des sept onglets de configuration. L'état est centralisé dans
 * useSettingsState ; un unique bouton « Enregistrer » sauvegarde les sections
 * modifiées (restaurant, préférences de notifications, calendriers) et une
 * garde de sortie prévient toute navigation avec des changements non sauvés.
 * L'onglet Catégories fait exception : ses modifications sont persistées
 * immédiatement, indépendamment du bouton global.
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
import { Save } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useSettingsState } from './settings/useSettingsState';
import { InfosTab } from './settings/InfosTab';
import { HorairesTab } from './settings/HorairesTab';
import { AccessibiliteTab } from './settings/AccessibiliteTab';
import { CategoriesTab } from './settings/CategoriesTab';
import { TagsTab } from './settings/TagsTab';
import { NotificationsTab } from './settings/NotificationsTab';
import { CalendriersTab } from './settings/CalendriersTab';

export function SettingsPage() {
    const location = useLocation();
    const state = useSettingsState();
    const { isLoading, isSaving, hasChanges, saveAll } = state;

    const [tab, setTab] = useState('infos');
    const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);

    // Avertissement avant de fermer/recharger l'onglet du navigateur
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasChanges) { e.preventDefault(); e.returnValue = ''; }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasChanges]);

    // Interception des clics de navigation interne avec changements non sauvés
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const anchor = (e.target as HTMLElement).closest('a');
            if (anchor?.href && hasChanges) {
                const url = new URL(anchor.href);
                if (url.pathname !== location.pathname) {
                    e.preventDefault();
                    e.stopPropagation();
                    setPendingNavHref(anchor.href);
                }
            }
        };
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, [hasChanges, location.pathname]);

    if (isLoading) {
        return (
            <div className="container-mariam py-8 flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
        );
    }

    return (
        <div className="container-mariam py-6 max-w-4xl">
            <p className="text-sm text-muted-foreground mb-5">Configurez votre restaurant universitaire.</p>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="w-full overflow-x-auto flex-nowrap justify-start gap-1 h-auto p-1 mb-6 bg-muted rounded-xl">
                    <TabsTrigger value="infos" className="rounded-lg text-sm shrink-0">Infos</TabsTrigger>
                    <TabsTrigger value="horaires" className="rounded-lg text-sm shrink-0">Horaires</TabsTrigger>
                    <TabsTrigger value="accessibilite" className="rounded-lg text-sm shrink-0">Accessibilité</TabsTrigger>
                    <TabsTrigger value="categories" className="rounded-lg text-sm shrink-0">Catégories</TabsTrigger>
                    <TabsTrigger value="tags" className="rounded-lg text-sm shrink-0">Tags & Labels</TabsTrigger>
                    <TabsTrigger value="notifications" className="rounded-lg text-sm shrink-0">Notifications</TabsTrigger>
                    <TabsTrigger value="calendriers" className="rounded-lg text-sm shrink-0">Calendriers</TabsTrigger>
                </TabsList>

                <TabsContent value="infos" className="space-y-6 mt-0">
                    <InfosTab state={state} />
                </TabsContent>

                <TabsContent value="horaires" className="mt-0">
                    <HorairesTab state={state} />
                </TabsContent>

                <TabsContent value="accessibilite" className="mt-0">
                    <AccessibiliteTab state={state} />
                </TabsContent>

                <TabsContent value="categories" className="mt-0">
                    <CategoriesTab />
                </TabsContent>

                <TabsContent value="tags" className="space-y-6 mt-0">
                    <TagsTab state={state} />
                </TabsContent>

                <TabsContent value="notifications" className="mt-0">
                    <NotificationsTab state={state} />
                </TabsContent>

                <TabsContent value="calendriers" className="mt-0">
                    <CalendriersTab state={state} />
                </TabsContent>
            </Tabs>

            {/* Barre de sauvegarde unifiée : visible dès qu'une section est modifiée */}
            {hasChanges && (
                <>
                    <div aria-hidden className="h-20 sidebar:hidden" />
                    <div className="fixed inset-x-3 bottom-[4.75rem] z-30 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 backdrop-blur px-4 py-2.5 shadow-lg sidebar:static sidebar:inset-x-auto sidebar:bottom-auto sidebar:z-auto sidebar:mt-8 sidebar:shadow-sm animate-in fade-in slide-in-from-bottom-2">
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span className="hidden sm:inline">Modifications non enregistrées</span>
                            <span className="sm:hidden">Non enregistré</span>
                        </p>
                        <Button onClick={saveAll} disabled={isSaving} size="sm" className="gap-2">
                            <Save className="w-3.5 h-3.5" />
                            {isSaving ? 'Enregistrement…' : 'Enregistrer'}
                        </Button>
                    </div>
                </>
            )}

            <AlertDialog open={pendingNavHref !== null} onOpenChange={open => { if (!open) setPendingNavHref(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Modifications non sauvegardées</AlertDialogTitle>
                        <AlertDialogDescription>
                            Vous avez des modifications non enregistrées. Si vous continuez, elles seront perdues.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingNavHref(null)}>Rester</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => { if (pendingNavHref) window.location.href = pendingNavHref; }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Quitter sans sauvegarder
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
