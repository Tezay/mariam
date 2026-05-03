import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, ChevronRight, Save, SkipForward } from 'lucide-react';
import { menusApi } from '@/lib/api';
import type { MenuCategory, MenuItem, DietaryTag, CertificationItem } from '@/lib/api';
import { getCategoryColor } from '@/lib/category-colors';
import { Icon, type IconName } from '@/components/ui/icon-picker';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatGroup {
    category: MenuCategory;
    parentLabel?: string;
    catId: number;
}

interface ConfirmedItem {
    catId: number;
    name: string;
    tags: DietaryTag[];
    certifications: CertificationItem[];
}

type Phase = 'item-name' | 'item-tags' | 'item-added' | 'chef-note';

interface PendingItem {
    name: string;
    tags: DietaryTag[];
    certifications: CertificationItem[];
}

interface TagConfig {
    dietary_tags: DietaryTag[];
    certifications: CertificationItem[];
}

async function fetchTagConfig(): Promise<TagConfig> {
    const res = await api.get('/settings');
    const r = res.data.restaurant;
    return { dietary_tags: r.config?.dietary_tags ?? [], certifications: r.config?.certifications ?? [] };
}

// ─── Dialogue messages ────────────────────────────────────────────────────────

const INTRO_DIALOGUES = [
    (label: string) => `Qu'est-ce qu'on mange comme ${label} ?`,
    (label: string) => `Ajoutez vos ${label} !`,
    (label: string) => `C'est l'heure des ${label} !`,
    (label: string) => `Et pour les ${label} aujourd'hui ?`,
];
const TAG_DIALOGUES = [
    'Ce plat a des particularités ?',
    'Des infos à ajouter ?',
    'Allergènes, labels, certifications ?',
    'On tague ce plat ?',
];
const MORE_DIALOGUES = [
    (label: string) => `Un autre plat en ${label} ?`,
    (label: string) => `Encore des ${label} ?`,
    (label: string) => `D'autres ${label} à ajouter ?`,
];

function pickIdx<T>(arr: T[], seed: number): T {
    return arr[seed % arr.length];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCatGroups(topCategories: MenuCategory[]): CatGroup[] {
    const groups: CatGroup[] = [];
    for (const cat of topCategories) {
        if (cat.is_highlighted && (cat.subcategories?.length ?? 0) > 0) {
            for (const sub of cat.subcategories!) {
                groups.push({ category: sub, parentLabel: cat.label, catId: sub.id });
            }
        } else {
            groups.push({ category: cat, catId: cat.id });
        }
    }
    return groups;
}

const EMPTY_PENDING: PendingItem = { name: '', tags: [], certifications: [] };

// ─── Sub-components ───────────────────────────────────────────────────────────

function DialogueBubble({ text, animate = false }: { text: string; animate?: boolean }) {
    return (
        <div className={cn(
            'bg-primary/5 border border-primary/20 rounded-2xl rounded-tl-sm px-4 py-3 text-sm font-semibold text-foreground max-w-xs',
            animate && 'animate-in fade-in slide-in-from-left-2 duration-300',
        )}>
            {text}
        </div>
    );
}

function ProgressBar({ groups, groupIdx, phase }: { groups: CatGroup[]; groupIdx: number; phase: Phase }) {
    const total = groups.length + 1; // +1 for chef-note
    const activeIdx = phase === 'chef-note' ? groups.length : groupIdx;

    return (
        <div className="flex gap-1 px-4 pt-4 pb-2 shrink-0">
            {Array.from({ length: total }, (_, i) => {
                const group = i < groups.length ? groups[i] : null;
                const color = group ? getCategoryColor(group.category.color_key, i).bg : '#093EAA';
                const isDone = i < activeIdx;
                const isActive = i === activeIdx;
                return (
                    <div
                        key={i}
                        className={cn(
                            'flex-1 h-2 rounded-full transition-all duration-300',
                            isDone ? 'opacity-100' : isActive ? 'opacity-100' : 'opacity-20',
                        )}
                        style={{
                            backgroundColor: color,
                            ...(isActive ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
                        }}
                    />
                );
            })}
        </div>
    );
}

// ─── MenuOnboarding ───────────────────────────────────────────────────────────

interface MenuOnboardingProps {
    date: string;
    restaurantId: number | undefined;
    categories: MenuCategory[];
    onDone: () => void;
    onCancel: () => void;
}

export function MenuOnboarding({ date, restaurantId, categories, onDone, onCancel }: MenuOnboardingProps) {
    const groups = buildCatGroups(categories);
    const [tagConfig, setTagConfig] = useState<TagConfig>({ dietary_tags: [], certifications: [] });

    const [groupIdx, setGroupIdx] = useState(0);
    const [phase, setPhase] = useState<Phase>('item-name');
    const [pending, setPending] = useState<PendingItem>(EMPTY_PENDING);
    const [confirmedItems, setConfirmedItems] = useState<ConfirmedItem[]>([]);
    const [chefNote, setChefNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showCancelDialog, setShowCancelDialog] = useState(false);

    const nameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchTagConfig().then(setTagConfig).catch(() => {});
    }, []);

    useEffect(() => {
        if (phase === 'item-name') {
            setTimeout(() => nameInputRef.current?.focus(), 50);
        }
    }, [phase, groupIdx]);

    const currentGroup = groups[groupIdx] ?? null;
    const seed = groupIdx * 7 + confirmedItems.length;
    const currentColor = currentGroup
        ? getCategoryColor(currentGroup.category.color_key, groupIdx)
        : { bg: '#093EAA', border: '#093EAA', label: '#FFFFFF', sectionLabel: '#093EAA', sectionBorder: '#093EAA', addBg: '#F0F3FF', addLabel: '#093EAA' };

    const addConfirmedItem = useCallback(() => {
        const item: ConfirmedItem = {
            catId: currentGroup!.catId,
            name: pending.name.trim(),
            tags: pending.tags,
            certifications: pending.certifications,
        };
        setConfirmedItems(prev => [...prev, item]);
        setPending(EMPTY_PENDING);
        setPhase('item-added');
    }, [currentGroup, pending]);

    const confirmItemName = useCallback(() => {
        const name = pending.name.trim();
        if (!name) return;
        if (tagConfig.dietary_tags.length > 0 || tagConfig.certifications.length > 0) {
            setPhase('item-tags');
        } else {
            addConfirmedItem();
        }
    }, [pending.name, tagConfig, addConfirmedItem]);

    const addAnother = useCallback(() => {
        setPhase('item-name');
    }, []);

    const nextGroup = useCallback(() => {
        const next = groupIdx + 1;
        if (next >= groups.length) {
            setPhase('chef-note');
        } else {
            setGroupIdx(next);
            setPhase('item-name');
        }
    }, [groupIdx, groups.length]);

    const skipGroup = useCallback(() => {
        nextGroup();
    }, [nextGroup]);

    const handleCreate = async (publish: boolean) => {
        setIsSaving(true);
        setError(null);
        const items: MenuItem[] = confirmedItems.map(ci => ({
            category_id: ci.catId,
            name: ci.name,
            tags: ci.tags,
            certifications: ci.certifications,
            is_out_of_stock: false,
        }));
        try {
            const savedMenu = await menusApi.save(date, items, restaurantId, chefNote.trim() || undefined);
            if (publish && savedMenu?.id) {
                await menusApi.publish(savedMenu.id);
            }
            onDone();
        } catch {
            setError('Erreur lors de la création du menu. Veuillez réessayer.');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleTag = (tag: DietaryTag) => {
        setPending(p => ({
            ...p,
            tags: p.tags.find(t => t.id === tag.id)
                ? p.tags.filter(t => t.id !== tag.id)
                : [...p.tags, tag],
        }));
    };

    const toggleCert = (cert: CertificationItem) => {
        setPending(p => ({
            ...p,
            certifications: p.certifications.find(c => c.id === cert.id)
                ? p.certifications.filter(c => c.id !== cert.id)
                : [...p.certifications, cert],
        }));
    };

    if (phase === 'chef-note') {
        const itemCount = confirmedItems.length;
        return (
            <div className="flex flex-col flex-1 min-h-0">
                <ProgressBar groups={groups} groupIdx={groupIdx} phase={phase} />

                <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
                    <p className="text-xs text-muted-foreground">Étape finale</p>
                    <DialogueBubble text="Une note du chef pour ce menu ? (optionnel)" animate />
                    <textarea
                        value={chefNote}
                        onChange={e => setChefNote(e.target.value)}
                        placeholder="Message du chef pour ce jour…"
                        rows={4}
                        className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        autoFocus
                    />
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <div className="shrink-0 flex flex-col gap-2 p-4 pt-3 border-t border-border bg-background">
                    <Button
                        variant="ghost"
                        onClick={() => { setGroupIdx(groups.length - 1); setPhase('item-added'); }}
                        className="rounded-xl self-start text-muted-foreground"
                    >
                        Retour
                    </Button>
                    <Button
                        onClick={() => handleCreate(true)}
                        disabled={isSaving}
                        className="w-full gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-white"
                    >
                        <Check className="w-4 h-4" />
                        {isSaving ? '…' : `Publier maintenant (${itemCount} plat${itemCount !== 1 ? 's' : ''})`}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => handleCreate(false)}
                        disabled={isSaving}
                        className="w-full gap-1.5 rounded-xl border-orange-300 text-orange-700 hover:bg-orange-50"
                    >
                        <Save className="w-4 h-4" />
                        {isSaving ? '…' : 'Enregistrer en brouillon'}
                    </Button>
                    <p className="text-[10px] text-muted-foreground text-center">
                        Publier = visible immédiatement · Brouillon = préparation en cours
                    </p>
                </div>
            </div>
        );
    }

    if (!currentGroup) return null;
    const catLabel = currentGroup.category.label;

    // ── Phase: item-added ──
    if (phase === 'item-added') {
        const confirmedItemsForGroup = confirmedItems.filter(i => i.catId === currentGroup.catId);

        return (
            <div className="flex flex-col flex-1 min-h-0">
                <ProgressBar groups={groups} groupIdx={groupIdx} phase={phase} />

                <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
                    <div className="flex flex-col items-center gap-3 pt-2">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center"
                             style={{ backgroundColor: currentColor.bg }}>
                            <Check className="w-7 h-7 text-white" />
                        </div>
                        <DialogueBubble text={pickIdx(MORE_DIALOGUES, seed)(catLabel)} />
                    </div>

                    {confirmedItemsForGroup.length > 0 && (
                        <div className="space-y-2 mt-2">
                            {confirmedItemsForGroup.map((ci, i) => {
                                const isNewest = i === confirmedItemsForGroup.length - 1;
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            'flex items-center gap-2 px-3 py-2 rounded-xl text-sm',
                                            isNewest && 'animate-in slide-in-from-bottom-2 fade-in duration-300',
                                        )}
                                        style={{
                                            backgroundColor: currentColor.bg + '1A',
                                            color: currentColor.sectionLabel,
                                        }}
                                    >
                                        <Check className="w-3.5 h-3.5 opacity-70 shrink-0" />
                                        <span className="font-medium flex-1">{ci.name}</span>
                                        {ci.tags.length > 0 && (
                                            <span className="text-xs opacity-60 shrink-0">
                                                {ci.tags.length} tag{ci.tags.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="shrink-0 flex flex-col gap-2 p-4 pt-3 border-t border-border bg-background">
                    <Button
                        onClick={addAnother}
                        className="w-full gap-1.5 rounded-xl"
                        style={{ backgroundColor: currentColor.bg, borderColor: currentColor.border }}
                    >
                        <ChevronRight className="w-4 h-4" />
                        Ajouter un autre {catLabel.toLowerCase()}
                    </Button>
                    <Button variant="outline" onClick={nextGroup} className="w-full rounded-xl">
                        {groupIdx + 1 < groups.length ? 'Passer à la catégorie suivante →' : 'Terminer →'}
                    </Button>
                </div>
            </div>
        );
    }

    // ── Phase: item-name ──
    if (phase === 'item-name') {
        return (
            <div className="flex flex-col flex-1 min-h-0">
                <ProgressBar groups={groups} groupIdx={groupIdx} phase={phase} />

                <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
                    <div>
                        <p className="text-xs text-muted-foreground">
                            {currentGroup.parentLabel ? `${currentGroup.parentLabel} · ` : ''}
                            {catLabel}
                            {confirmedItems.filter(i => i.catId === currentGroup.catId).length > 0 && (
                                <span className="ml-1 font-medium text-primary">
                                    · {confirmedItems.filter(i => i.catId === currentGroup.catId).length} plat{confirmedItems.filter(i => i.catId === currentGroup.catId).length !== 1 ? 's' : ''} ajouté{confirmedItems.filter(i => i.catId === currentGroup.catId).length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </p>
                    </div>

                    <DialogueBubble text={pickIdx(INTRO_DIALOGUES, seed)(catLabel)} animate />

                    <input
                        ref={nameInputRef}
                        value={pending.name}
                        onChange={e => setPending(p => ({ ...p, name: e.target.value }))}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); if (pending.name.trim()) confirmItemName(); }
                        }}
                        placeholder="Nom du plat…"
                        className="w-full rounded-2xl border-2 px-4 py-3.5 text-sm font-medium focus:outline-none transition-colors"
                        style={{
                            borderColor: currentColor.border,
                            backgroundColor: currentColor.bg + '11',
                        }}
                        autoComplete="off"
                    />
                </div>

                <div className="shrink-0 flex items-center gap-2 p-4 pt-3 border-t border-border bg-background">
                    {confirmedItems.filter(i => i.catId === currentGroup.catId).length > 0 ? (
                        <Button variant="ghost" onClick={skipGroup} className="gap-1 text-muted-foreground rounded-xl">
                            <SkipForward className="w-3.5 h-3.5" />
                            Passer
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            onClick={groupIdx === 0
                                ? () => confirmedItems.length > 0 ? setShowCancelDialog(true) : onCancel()
                                : skipGroup
                            }
                            className="text-muted-foreground rounded-xl"
                        >
                            {groupIdx === 0 ? 'Annuler' : 'Passer'}
                        </Button>
                    )}
                    <div className="flex-1" />
                    <Button
                        onClick={confirmItemName}
                        disabled={!pending.name.trim()}
                        className="gap-1.5 rounded-xl"
                        style={pending.name.trim() ? { backgroundColor: currentColor.bg, borderColor: currentColor.border } : {}}
                    >
                        Valider
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>

                <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Abandonner la création ?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Les plats déjà saisis ne seront pas enregistrés.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setShowCancelDialog(false)} className="rounded-xl">
                                Continuer la saisie
                            </AlertDialogCancel>
                            <AlertDialogAction onClick={onCancel} className="rounded-xl">
                                Abandonner
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        );
    }

    // ── Phase: item-tags ──
    const hasConfig = tagConfig.dietary_tags.length > 0 || tagConfig.certifications.length > 0;
    return (
        <div className="flex flex-col flex-1 min-h-0">
            <ProgressBar groups={groups} groupIdx={groupIdx} phase={phase} />

            <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground truncate">{pending.name}</p>

                <DialogueBubble text={pickIdx(TAG_DIALOGUES, seed)} animate />

                {hasConfig ? (
                    <div className="space-y-4">
                        {tagConfig.dietary_tags.length > 0 && (
                            <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Tags alimentaires</p>
                                <div className="flex flex-wrap gap-2 justify-center">
                                    {tagConfig.dietary_tags.map(tag => {
                                        const selected = !!pending.tags.find(t => t.id === tag.id);
                                        return (
                                            <button
                                                key={tag.id}
                                                type="button"
                                                onClick={() => toggleTag(tag)}
                                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all"
                                                style={{
                                                    backgroundColor: tag.color + (selected ? '33' : '11'),
                                                    color: tag.color,
                                                    borderColor: tag.color + (selected ? 'AA' : '44'),
                                                    ...(selected ? { outline: `3px solid ${tag.color}`, outlineOffset: '2px' } : {}),
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
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Certifications</p>
                                <div className="flex flex-wrap gap-2 justify-center">
                                    {tagConfig.certifications.map(cert => {
                                        const selected = !!pending.certifications.find(c => c.id === cert.id);
                                        return (
                                            <button
                                                key={cert.id}
                                                type="button"
                                                onClick={() => toggleCert(cert)}
                                                className={cn(
                                                    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all',
                                                    selected
                                                        ? 'bg-primary/10 text-primary border-primary/50'
                                                        : 'bg-gray-50 text-gray-500 border-gray-200',
                                                )}
                                                style={selected ? { outline: '3px solid #093EAA', outlineOffset: '2px' } : {}}
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
                    <p className="text-sm text-muted-foreground text-center py-4">Aucun tag configuré pour ce restaurant.</p>
                )}
            </div>

            <div className="shrink-0 flex items-center gap-2 p-4 pt-3 border-t border-border bg-background">
                <Button variant="ghost" onClick={() => setPhase('item-name')} className="rounded-xl">Retour</Button>
                <div className="flex-1" />
                <Button variant="ghost" onClick={addConfirmedItem} className="text-muted-foreground rounded-xl">
                    Aucun tag
                </Button>
                <Button onClick={addConfirmedItem} className="gap-1.5 rounded-xl">
                    Valider
                    <ChevronRight className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}