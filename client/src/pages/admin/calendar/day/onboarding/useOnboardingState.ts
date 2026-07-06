/**
 * État central de l'onboarding de création de menu.
 *
 * Enveloppe useMenuEditor (items, substitutions, auto-save) et pilote la
 * machine à états du wizard. Un nouveau plat est créé IMMÉDIATEMENT au
 * catalogue (catalogApi.create) dès la confirmation de ses tags — ce qui
 * permet l'upload photo direct et fiabilise la déduplication. Le brouillon
 * de menu est auto-sauvegardé (débouncé) après chaque modification.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import api, { catalogApi, menusApi } from '@/lib/api';
import type { Menu, MenuCategory, DietaryTag, CertificationItem, DishCatalogItem } from '@/lib/api';
import { notify } from '@/lib/toast';
import { useMenuEditor, type UseMenuEditorReturn } from '../useMenuEditor';
import { buildCatGroups, type CatGroup, type OnboardingStep, type PendingDish, type TagConfig } from './types';

const AUTOSAVE_DELAY_MS = 1500;

async function fetchTagConfig(): Promise<TagConfig> {
    const res = await api.get('/settings');
    const r = res.data.restaurant;
    return { dietary_tags: r.config?.dietary_tags ?? [], certifications: r.config?.certifications ?? [] };
}

export interface UseOnboardingStateOptions {
    date: string;
    restaurantId: number | undefined;
    categories: MenuCategory[];
    /** Appelé quand le wizard doit se fermer (terminé, abandonné ou bloqué). */
    onExit: (reason: 'done' | 'discarded' | 'blocked') => void;
}

export interface UseOnboardingStateReturn {
    editor: UseMenuEditorReturn;
    step: OnboardingStep;
    groups: CatGroup[];
    currentGroup: CatGroup | null;
    tagConfig: TagConfig;
    isBootstrapping: boolean;
    isResuming: boolean;
    isCreatingDish: boolean;
    isFinalizing: boolean;
    pendingDish: PendingDish | null;
    /** Plat concerné par l'étape photo / l'écran « ajouté » courant. */
    activeDish: DishCatalogItem | null;
    /** Plats proposables pour la catégorie courante (strict, dédupliqués, hors menu). */
    availableDishes: DishCatalogItem[];
    /** Le nom tapé correspond-il à un plat déjà présent dans le menu ? */
    findInMenuByName(name: string): DishCatalogItem | null;
    selectExistingDish(dish: DishCatalogItem): void;
    startNewDish(name: string): void;
    togglePendingTag(tag: DietaryTag): void;
    togglePendingCert(cert: CertificationItem): void;
    confirmNewDishTags(): Promise<void>;
    uploadDishPhoto(file: File): Promise<void>;
    skipPhoto(): void;
    openPhotoStep(dish: DishCatalogItem): void;
    addAnother(): void;
    finishCategory(): void;
    skipCategory(): void;
    confirmSubstitutionsAndNext(): void;
    goBack(): void;
    canGoBack: boolean;
    publish(): Promise<void>;
    saveAndExit(): Promise<void>;
    discardAndExit(): Promise<void>;
    exitAfterCelebration(): void;
}

export function useOnboardingState({ date, restaurantId, categories, onExit }: UseOnboardingStateOptions): UseOnboardingStateReturn {
    // ── Bootstrap : menu existant + catalogue + config tags ──────────────────
    const [initialMenu, setInitialMenu] = useState<Menu | null>(null);
    const [catalog, setCatalog] = useState<DishCatalogItem[]>([]);
    const [tagConfig, setTagConfig] = useState<TagConfig>({ dietary_tags: [], certifications: [] });
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [isResuming, setIsResuming] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [menu, dishes, config] = await Promise.all([
                    menusApi.getByDate(date, restaurantId).catch(() => null),
                    catalogApi.list({ sort: 'usage' }).catch(() => [] as DishCatalogItem[]),
                    fetchTagConfig().catch(() => ({ dietary_tags: [], certifications: [] })),
                ]);
                if (cancelled) return;
                if (menu?.status === 'published') {
                    notify.info('Un menu publié existe déjà pour cette date.');
                    onExit('blocked');
                    return;
                }
                if (menu) {
                    setInitialMenu(menu);
                    setIsResuming(true);
                    notify.info('Brouillon existant repris');
                }
                setCatalog(dishes);
                setTagConfig(config);
            } finally {
                if (!cancelled) setIsBootstrapping(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap unique au mount
    }, []);

    const editor = useMenuEditor({ date, menu: initialMenu, restaurantId });

    // ── Machine à états ───────────────────────────────────────────────────────
    const groups = useMemo(() => buildCatGroups(categories), [categories]);
    const [step, setStep] = useState<OnboardingStep>({ kind: 'category', groupIdx: 0, sub: 'pick' });
    const [pendingDish, setPendingDish] = useState<PendingDish | null>(null);
    const [activeDish, setActiveDish] = useState<DishCatalogItem | null>(null);
    const [isCreatingDish, setIsCreatingDish] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);

    const currentGroup = step.kind === 'category' ? groups[step.groupIdx] ?? null : null;

    // ── Auto-save débouncé + flush ────────────────────────────────────────────
    const savePromiseRef = useRef<Promise<void> | null>(null);

    const runSave = useCallback(() => {
        const p = editor.save({ silent: true })
            .catch(() => {}) // l'erreur est déjà notifiée par le hook ; l'auto-save réessaiera
            .finally(() => { if (savePromiseRef.current === p) savePromiseRef.current = null; });
        savePromiseRef.current = p;
        return p;
    }, [editor]);

    useEffect(() => {
        if (isBootstrapping || !editor.isDirty || editor.isSaving) return;
        const t = setTimeout(runSave, AUTOSAVE_DELAY_MS);
        return () => clearTimeout(t);
    }, [isBootstrapping, editor.isDirty, editor.isSaving, runSave]);

    /** Attend le save en vol puis persiste ce qui reste de dirty. */
    const flushSave = useCallback(async () => {
        if (savePromiseRef.current) await savePromiseRef.current;
        if (editor.isDirty) await editor.save({ silent: true });
    }, [editor]);

    // ── Sélection / création de plats ─────────────────────────────────────────
    const menuDishIds = useMemo(
        () => new Set(editor.items.map(it => it.dish_id)),
        [editor.items],
    );

    const availableDishes = useMemo(() => {
        if (!currentGroup) return [];
        const seen = new Set<number>();
        return catalog.filter(d => {
            if (d.category_id !== currentGroup.catId) return false;
            if (menuDishIds.has(d.id)) return false;
            if (seen.has(d.id)) return false;
            seen.add(d.id);
            return true;
        });
    }, [catalog, currentGroup, menuDishIds]);

    const findInMenuByName = useCallback((name: string): DishCatalogItem | null => {
        const norm = name.trim().toLowerCase();
        for (const item of editor.items) {
            if (item.dish?.name.trim().toLowerCase() === norm) return item.dish;
        }
        return null;
    }, [editor.items]);

    const selectExistingDish = useCallback((dish: DishCatalogItem) => {
        if (step.kind !== 'category' || !currentGroup || menuDishIds.has(dish.id)) return;
        editor.addItem(currentGroup.catId, dish.id, dish);
        setActiveDish(dish);
        setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'added' });
    }, [currentGroup, menuDishIds, editor, step]);

    const startNewDish = useCallback((name: string) => {
        if (step.kind !== 'category') return;
        setPendingDish({ name: name.trim(), tags: [], certifications: [] });
        // Sans config de tags, le TagsStep affiche directement le bouton Valider.
        setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'tags' });
    }, [step]);

    const togglePendingTag = useCallback((tag: DietaryTag) => {
        setPendingDish(prev => prev && ({
            ...prev,
            tags: prev.tags.some(t => t.id === tag.id)
                ? prev.tags.filter(t => t.id !== tag.id)
                : [...prev.tags, tag],
        }));
    }, []);

    const togglePendingCert = useCallback((cert: CertificationItem) => {
        setPendingDish(prev => prev && ({
            ...prev,
            certifications: prev.certifications.some(c => c.id === cert.id)
                ? prev.certifications.filter(c => c.id !== cert.id)
                : [...prev.certifications, cert],
        }));
    }, []);

    const confirmNewDishTags = useCallback(async () => {
        if (step.kind !== 'category' || !pendingDish || !currentGroup || isCreatingDish) return;
        setIsCreatingDish(true);
        try {
            const dish = await catalogApi.create({
                name: pendingDish.name,
                category_id: currentGroup.catId,
                tag_ids: pendingDish.tags.map(t => t.id),
                certification_ids: pendingDish.certifications.map(c => c.id),
            });
            setCatalog(prev => [dish, ...prev]);
            editor.addItem(currentGroup.catId, dish.id, dish);
            setActiveDish(dish);
            setPendingDish(null);
            setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'photo' });
        } catch {
            notify.error('Impossible de créer le plat. Réessayez.');
        } finally {
            setIsCreatingDish(false);
        }
    }, [step, pendingDish, currentGroup, isCreatingDish, editor]);

    const uploadDishPhoto = useCallback(async (file: File) => {
        if (!activeDish) return;
        const updated = await catalogApi.uploadImage(activeDish.id, file);
        setActiveDish(updated);
        setCatalog(prev => prev.map(d => d.id === updated.id ? updated : d));
        // Rafraîchir l'objet dish de l'item pour l'aperçu
        const item = editor.items.find(it => it.dish_id === updated.id);
        if (item?.id !== undefined) editor.updateItem(item.id, { dish: updated });
    }, [activeDish, editor]);

    const skipPhoto = useCallback(() => {
        if (step.kind !== 'category') return;
        setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'added' });
    }, [step]);

    const openPhotoStep = useCallback((dish: DishCatalogItem) => {
        if (step.kind !== 'category') return;
        setActiveDish(dish);
        setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'photo' });
    }, [step]);

    // ── Navigation ────────────────────────────────────────────────────────────
    const itemCountForGroup = useCallback(
        (group: CatGroup) => editor.items.filter(it => it.category_id === group.catId).length,
        [editor.items],
    );

    const gotoNextGroupOrChefNote = useCallback((fromIdx: number) => {
        if (fromIdx + 1 < groups.length) {
            setStep({ kind: 'category', groupIdx: fromIdx + 1, sub: 'pick' });
        } else {
            setStep({ kind: 'chef-note' });
        }
    }, [groups.length]);

    const addAnother = useCallback(() => {
        if (step.kind !== 'category') return;
        setActiveDish(null);
        setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'pick' });
    }, [step]);

    const finishCategory = useCallback(() => {
        if (step.kind !== 'category' || !currentGroup) return;
        setActiveDish(null);
        if (itemCountForGroup(currentGroup) === 0) {
            gotoNextGroupOrChefNote(step.groupIdx);
        } else {
            setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'substitutions' });
        }
    }, [step, currentGroup, itemCountForGroup, gotoNextGroupOrChefNote]);

    /** « Passer cette catégorie » depuis pick, sans plat ajouté : saute aussi les substitutions. */
    const skipCategory = useCallback(() => {
        if (step.kind !== 'category') return;
        setActiveDish(null);
        gotoNextGroupOrChefNote(step.groupIdx);
    }, [step, gotoNextGroupOrChefNote]);

    const confirmSubstitutionsAndNext = useCallback(() => {
        if (step.kind !== 'category') return;
        gotoNextGroupOrChefNote(step.groupIdx);
    }, [step, gotoNextGroupOrChefNote]);

    const lastNonEmptyGroupIdx = useCallback(() => {
        for (let i = groups.length - 1; i >= 0; i--) {
            if (itemCountForGroup(groups[i]) > 0) return i;
        }
        return -1;
    }, [groups, itemCountForGroup]);

    const canGoBack = useMemo(() => {
        if (step.kind === 'chef-note') return lastNonEmptyGroupIdx() >= 0;
        if (step.kind !== 'category') return false;
        if (step.sub === 'tags' || step.sub === 'substitutions') return true;
        return step.sub === 'pick' && step.groupIdx > 0;
    }, [step, lastNonEmptyGroupIdx]);

    const goBack = useCallback(() => {
        if (step.kind === 'chef-note') {
            const idx = lastNonEmptyGroupIdx();
            if (idx >= 0) setStep({ kind: 'category', groupIdx: idx, sub: 'substitutions' });
            return;
        }
        if (step.kind !== 'category') return;
        if (step.sub === 'tags') {
            setPendingDish(null);
            setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'pick' });
        } else if (step.sub === 'substitutions') {
            setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'added' });
        } else if (step.sub === 'pick' && step.groupIdx > 0) {
            const prevIdx = step.groupIdx - 1;
            const prevHasItems = itemCountForGroup(groups[prevIdx]) > 0;
            setStep({ kind: 'category', groupIdx: prevIdx, sub: prevHasItems ? 'substitutions' : 'pick' });
        }
    }, [step, groups, itemCountForGroup, lastNonEmptyGroupIdx]);

    // ── Finalisation / sortie ─────────────────────────────────────────────────
    const publish = useCallback(async () => {
        if (isFinalizing) return;
        setIsFinalizing(true);
        try {
            await flushSave();
            await editor.publishMenu();
            setStep({ kind: 'celebration' });
        } catch {
            // erreurs déjà notifiées par le hook
        } finally {
            setIsFinalizing(false);
        }
    }, [isFinalizing, flushSave, editor]);

    const saveAndExit = useCallback(async () => {
        if (isFinalizing) return;
        setIsFinalizing(true);
        try {
            await flushSave();
            onExit('done');
        } catch {
            // save en échec : on reste dans le wizard
        } finally {
            setIsFinalizing(false);
        }
    }, [isFinalizing, flushSave, onExit]);

    const menuIdRef = useRef<number | undefined>(undefined);
    useEffect(() => { menuIdRef.current = editor.menuId; }, [editor.menuId]);

    const discardAndExit = useCallback(async () => {
        if (isFinalizing) return;
        setIsFinalizing(true);
        try {
            // Attendre un éventuel save en vol pour ne pas recréer le menu après le DELETE
            if (savePromiseRef.current) await savePromiseRef.current;
            if (menuIdRef.current) await menusApi.delete(menuIdRef.current);
            onExit('discarded');
        } catch {
            notify.error("Impossible de supprimer le brouillon.");
            setIsFinalizing(false);
            return;
        }
        setIsFinalizing(false);
    }, [isFinalizing, onExit]);

    const exitAfterCelebration = useCallback(() => onExit('done'), [onExit]);

    return {
        editor,
        step,
        groups,
        currentGroup,
        tagConfig,
        isBootstrapping,
        isResuming,
        isCreatingDish,
        isFinalizing,
        pendingDish,
        activeDish,
        availableDishes,
        findInMenuByName,
        selectExistingDish,
        startNewDish,
        togglePendingTag,
        togglePendingCert,
        confirmNewDishTags,
        uploadDishPhoto,
        skipPhoto,
        openPhotoStep,
        addAnother,
        finishCategory,
        skipCategory,
        confirmSubstitutionsAndNext,
        goBack,
        canGoBack,
        publish,
        saveAndExit,
        discardAndExit,
        exitAfterCelebration,
    };
}