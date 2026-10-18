/**
 * A new dish is created in the catalog as soon as its tags are confirmed: its photo
 * then uploads straight to it, and duplicates are caught. The draft menu saves
 * itself, debounced, after every change.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSiteRef } from '@/contexts/SiteContext';
import { dishesApi } from '@/lib/api/dishes';
import { menusApi } from '@/lib/api/menus';
import { restaurantApi } from '@/lib/api/restaurant';
import type { Menu } from '@/lib/api/menus';
import type { MenuCategory } from '@/lib/api/categories';
import type { DietaryTag, CertificationItem } from '@/lib/api/taxonomy';
import type { Dish } from '@/lib/api/dishes';
import { notify } from '@/lib/toast';
import { useMenuEditor, type UseMenuEditorReturn } from '../useMenuEditor';
import {
  buildCatGroups,
  type CatGroup,
  type OnboardingStep,
  type PendingDish,
  type TagConfig,
} from './types';

const AUTOSAVE_DELAY_MS = 1500;

async function fetchTagConfig(): Promise<TagConfig> {
  const r = await restaurantApi.getMine();
  return {
    dietary_tags: r.config?.dietary_tags ?? [],
    certifications: r.config?.certifications ?? [],
  };
}

export interface UseOnboardingStateOptions {
  date: string;
  categories: MenuCategory[];
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
  /** The dish of the photo step or of the « added » screen. */
  activeDish: Dish | null;
  /** The current category's dishes, without duplicates or those already on the menu. */
  availableDishes: Dish[];
  findInMenuByName(name: string): Dish | null;
  selectExistingDish(dish: Dish): void;
  startNewDish(name: string): void;
  togglePendingTag(tag: DietaryTag): void;
  togglePendingCert(cert: CertificationItem): void;
  confirmNewDishTags(): Promise<void>;
  uploadDishPhoto(file: File): Promise<void>;
  skipPhoto(): void;
  openPhotoStep(dish: Dish): void;
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

export function useOnboardingState({
  date,
  categories,
  onExit,
}: UseOnboardingStateOptions): UseOnboardingStateReturn {
  const site = useSiteRef();
  const [initialMenu, setInitialMenu] = useState<Menu | null>(null);
  const [catalog, setCatalog] = useState<Dish[]>([]);
  const [tagConfig, setTagConfig] = useState<TagConfig>({ dietary_tags: [], certifications: [] });
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isResuming, setIsResuming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [menu, dishes, config] = await Promise.all([
          menusApi.get(site, date).catch(() => null),
          dishesApi.listAll(site, { sort: 'usage' }).catch(() => [] as Dish[]),
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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap unique au mount
  }, []);

  const editor = useMenuEditor({ date, menu: initialMenu });

  const groups = useMemo(() => buildCatGroups(categories), [categories]);
  const [step, setStep] = useState<OnboardingStep>({
    kind: 'category',
    groupIdx: 0,
    sub: 'pick',
  });
  const [pendingDish, setPendingDish] = useState<PendingDish | null>(null);
  const [activeDish, setActiveDish] = useState<Dish | null>(null);
  const [isCreatingDish, setIsCreatingDish] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const currentGroup = step.kind === 'category' ? (groups[step.groupIdx] ?? null) : null;

  const savePromiseRef = useRef<Promise<void> | null>(null);

  const runSave = useCallback(() => {
    const p = editor
      .save({ silent: true })
      .catch(() => {}) // The hook reports the error; the next auto-save tries again.
      .finally(() => {
        if (savePromiseRef.current === p) savePromiseRef.current = null;
      });
    savePromiseRef.current = p;
    return p;
  }, [editor]);

  useEffect(() => {
    if (isBootstrapping || !editor.isDirty || editor.isSaving) return;
    const t = setTimeout(runSave, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [isBootstrapping, editor.isDirty, editor.isSaving, runSave]);

  /** Waits for the save in flight, then saves what is still dirty. */
  const flushSave = useCallback(async () => {
    if (savePromiseRef.current) await savePromiseRef.current;
    if (editor.isDirty) await editor.save({ silent: true });
  }, [editor]);

  const menuDishIds = useMemo(() => new Set(editor.items.map((it) => it.dish_id)), [editor.items]);

  const availableDishes = useMemo(() => {
    if (!currentGroup) return [];
    const seen = new Set<number>();
    return catalog.filter((d) => {
      if (d.category_id !== currentGroup.catId) return false;
      if (menuDishIds.has(d.id)) return false;
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }, [catalog, currentGroup, menuDishIds]);

  const findInMenuByName = useCallback(
    (name: string): Dish | null => {
      const norm = name.trim().toLowerCase();
      for (const item of editor.items) {
        if (item.dish?.name.trim().toLowerCase() === norm) {
          return catalog.find((dish) => dish.id === item.dish_id) ?? null;
        }
      }
      return null;
    },
    [editor.items, catalog]
  );

  const selectExistingDish = useCallback(
    (dish: Dish) => {
      if (step.kind !== 'category' || !currentGroup || menuDishIds.has(dish.id)) return;
      editor.addItem(currentGroup.catId, dish.id, dish);
      setActiveDish(dish);
      setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'added' });
    },
    [currentGroup, menuDishIds, editor, step]
  );

  const startNewDish = useCallback(
    (name: string) => {
      if (step.kind !== 'category') return;
      setPendingDish({ name: name.trim(), tags: [], certifications: [] });
      // Without tags to offer, TagsStep shows its confirm button straight away.
      setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'tags' });
    },
    [step]
  );

  const togglePendingTag = useCallback((tag: DietaryTag) => {
    setPendingDish(
      (prev) =>
        prev && {
          ...prev,
          tags: prev.tags.some((t) => t.id === tag.id)
            ? prev.tags.filter((t) => t.id !== tag.id)
            : [...prev.tags, tag],
        }
    );
  }, []);

  const togglePendingCert = useCallback((cert: CertificationItem) => {
    setPendingDish(
      (prev) =>
        prev && {
          ...prev,
          certifications: prev.certifications.some((c) => c.id === cert.id)
            ? prev.certifications.filter((c) => c.id !== cert.id)
            : [...prev.certifications, cert],
        }
    );
  }, []);

  const confirmNewDishTags = useCallback(async () => {
    if (step.kind !== 'category' || !pendingDish || !currentGroup || isCreatingDish) return;
    setIsCreatingDish(true);
    try {
      const dish = await dishesApi.create(site, {
        name: pendingDish.name,
        category_id: currentGroup.catId,
        tag_ids: pendingDish.tags.map((t) => t.id),
        certification_ids: pendingDish.certifications.map((c) => c.id),
      });
      setCatalog((prev) => [dish, ...prev]);
      editor.addItem(currentGroup.catId, dish.id, dish);
      setActiveDish(dish);
      setPendingDish(null);
      setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'photo' });
    } catch {
      notify.error('Impossible de créer le plat. Réessayez.');
    } finally {
      setIsCreatingDish(false);
    }
  }, [site, step, pendingDish, currentGroup, isCreatingDish, editor]);

  const uploadDishPhoto = useCallback(
    async (file: File) => {
      if (!activeDish) return;
      const updated = await dishesApi.uploadImage(site, activeDish.id, file);
      setActiveDish(updated);
      setCatalog((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      const item = editor.items.find((it) => it.dish_id === updated.id);
      if (item?.id !== undefined) editor.updateItem(item.id, { dish: updated });
    },
    [site, activeDish, editor]
  );

  const skipPhoto = useCallback(() => {
    if (step.kind !== 'category') return;
    setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'added' });
  }, [step]);

  const openPhotoStep = useCallback(
    (dish: Dish) => {
      if (step.kind !== 'category') return;
      setActiveDish(dish);
      setStep({ kind: 'category', groupIdx: step.groupIdx, sub: 'photo' });
    },
    [step]
  );

  const itemCountForGroup = useCallback(
    (group: CatGroup) => editor.items.filter((it) => it.category_id === group.catId).length,
    [editor.items]
  );

  const gotoNextGroupOrChefNote = useCallback(
    (fromIdx: number) => {
      if (fromIdx + 1 < groups.length) {
        setStep({ kind: 'category', groupIdx: fromIdx + 1, sub: 'pick' });
      } else {
        setStep({ kind: 'chef-note' });
      }
    },
    [groups.length]
  );

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

  /** Skipping a category before any dish is added skips its substitutions too. */
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
      setStep({
        kind: 'category',
        groupIdx: prevIdx,
        sub: prevHasItems ? 'substitutions' : 'pick',
      });
    }
  }, [step, groups, itemCountForGroup, lastNonEmptyGroupIdx]);

  const publish = useCallback(async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);
    try {
      await flushSave();
      await editor.publishMenu();
      setStep({ kind: 'celebration' });
    } catch {
      // The hook has reported it.
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
      // The save failed: the wizard stays open.
    } finally {
      setIsFinalizing(false);
    }
  }, [isFinalizing, flushSave, onExit]);

  const hasMenuRef = useRef(false);
  useEffect(() => {
    hasMenuRef.current = editor.menuStatus !== null;
  }, [editor.menuStatus]);

  const discardAndExit = useCallback(async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);
    try {
      // A save in flight would create the menu again after the DELETE.
      if (savePromiseRef.current) await savePromiseRef.current;
      if (hasMenuRef.current) await menusApi.remove(site, date);
      onExit('discarded');
    } catch {
      notify.error('Impossible de supprimer le brouillon.');
      setIsFinalizing(false);
      return;
    }
    setIsFinalizing(false);
  }, [site, date, isFinalizing, onExit]);

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
