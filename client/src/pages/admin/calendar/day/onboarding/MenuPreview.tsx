/**
 * Aperçu du menu en construction : items groupés par catégorie, même langage
 * visuel que le calendrier (couleurs de catégorie, box 3D border-bottom).
 * Partagé entre le panel desktop et le drawer mobile.
 */
import { X, UtensilsCrossed } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuItem } from '@/lib/api';
import { getCategoryColor } from '@/lib/category-colors';
import type { UseMenuEditorReturn } from '../useMenuEditor';
import type { CatGroup } from './types';

interface MenuPreviewProps {
    groups: CatGroup[];
    editor: UseMenuEditorReturn;
}

function PreviewItemBox({ item, color, onRemove }: {
    item: MenuItem;
    color: ReturnType<typeof getCategoryColor>;
    onRemove: () => void;
}) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1.5 rounded-xl px-2 py-1.5"
            style={{ backgroundColor: color.bg, borderBottom: `3px solid ${color.border}` }}
        >
            <span className="flex-1 text-xs font-semibold truncate" style={{ color: color.label }}>
                {item.dish?.name ?? '…'}
            </span>
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Retirer ${item.dish?.name ?? 'ce plat'}`}
                className="shrink-0 rounded-full p-0.5 opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: color.label }}
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </motion.div>
    );
}

export function MenuPreview({ groups, editor }: MenuPreviewProps) {
    const nonEmptyGroups = groups
        .map((group, idx) => ({
            group,
            color: getCategoryColor(group.category.color_key, idx),
            items: editor.items.filter(it => it.category_id === group.catId),
        }))
        .filter(g => g.items.length > 0);

    if (nonEmptyGroups.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
                <div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center">
                    <UtensilsCrossed className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">Menu vide pour l'instant</p>
                <p className="text-xs text-muted-foreground">Les plats que vous ajoutez apparaîtront ici.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {nonEmptyGroups.map(({ group, color, items }) => (
                <section key={group.catId}>
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="h-px flex-1" style={{ backgroundColor: color.sectionBorder }} />
                        <h3
                            className="text-[10px] font-bold uppercase tracking-widest truncate"
                            style={{ color: color.sectionLabel }}
                        >
                            {group.parentLabel ? `${group.parentLabel} · ${group.category.label}` : group.category.label}
                        </h3>
                        <span className="h-px flex-1" style={{ backgroundColor: color.sectionBorder }} />
                    </div>
                    <div className="space-y-1.5">
                        <AnimatePresence initial={false}>
                            {items.map(item => (
                                <PreviewItemBox
                                    key={item.id}
                                    item={item}
                                    color={color}
                                    onRemove={() => item.id !== undefined && editor.removeItem(item.id)}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </section>
            ))}
        </div>
    );
}
