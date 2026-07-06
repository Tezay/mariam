import { ArrowLeftRight } from 'lucide-react';
import type { MenuItem, MenuCategory } from '@/lib/api';
import { getCategoryColor } from '@/lib/category-colors';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AdminMenuItemCard } from './AdminMenuItemCard';
import { AddDishCombobox } from './AddDishCombobox';
import { SubstitutionsSection } from './SubstitutionsSection';
import type { UseMenuEditorReturn } from './useMenuEditor';

interface AdminCategorySectionProps {
    category: MenuCategory;
    items: MenuItem[];
    editor: UseMenuEditorReturn;
    canEdit: boolean;
    hint?: boolean;
}

// ─── SubstitutionPopoverButton ────────────────────────────────────────────────

function SubstitutionPopoverButton({ categoryId, editor }: { categoryId: number; editor: UseMenuEditorReturn }) {
    const hasSubstitutes = (editor.substitutions[categoryId] ?? []).length > 0;
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={`shrink-0 flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-medium bg-background transition-colors ${
                        hasSubstitutes
                            ? 'border-orange-200 dark:border-orange-800/50 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30'
                            : 'border-border text-muted-foreground/60 hover:text-orange-500 hover:border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950/30'
                    }`}
                >
                    <ArrowLeftRight className="w-3 h-3 shrink-0" />
                    <span>En cas de rupture ?</span>
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-500 mb-2">Substitut si rupture</p>
                <SubstitutionsSection categoryId={categoryId} editor={editor} />
            </PopoverContent>
        </Popover>
    );
}

// ─── ItemList ─────────────────────────────────────────────────────────────────

interface ItemListProps {
    items: MenuItem[];
    actualCategory: MenuCategory;
    editor: UseMenuEditorReturn;
    canEdit: boolean;
    hint?: boolean;
}

function ItemList({ items, actualCategory, editor, canEdit, hint }: ItemListProps) {
    return (
        <>
            <div className="space-y-2">
                {items.map((item, idx) => (
                    <AdminMenuItemCard
                        key={item.id ?? `new-${idx}`}
                        item={item}
                        category={actualCategory}
                        editor={editor}
                        canEdit={canEdit}
                        hint={hint && idx === 0}
                    />
                ))}
            </div>
            {canEdit && <AddDishCombobox categoryId={actualCategory.id} editor={editor} />}
        </>
    );
}

// ─── StandardSection ──────────────────────────────────────────────────────────

function StandardSection({ category, items, editor, canEdit, hint }: AdminCategorySectionProps) {
    const color = getCategoryColor(category.color_key, category.order);

    return (
        <div className="space-y-3">
            <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px" style={{ backgroundColor: color.sectionBorder }} />
                <span className="text-xs font-bold uppercase tracking-widest shrink-0" style={{ color: color.sectionLabel }}>
                    {category.label}
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: color.sectionBorder }} />
                {canEdit && editor.menuId && (
                    <div className="absolute right-0">
                        <SubstitutionPopoverButton categoryId={category.id} editor={editor} />
                    </div>
                )}
            </div>

            <ItemList items={items} actualCategory={category} editor={editor} canEdit={canEdit} hint={hint} />
        </div>
    );
}

// ─── HighlightedSection ───────────────────────────────────────────────────────

function HighlightedSection({ category, items, editor, canEdit, hint }: AdminCategorySectionProps) {
    const hasSubcategories = (category.subcategories?.length ?? 0) > 0;
    const color = getCategoryColor(category.color_key, category.order);
    const headerTextColor = hasSubcategories ? '#093EAA' : color.sectionLabel;
    const headerLineColor = hasSubcategories ? '#C5D2F1' : color.sectionBorder;

    const itemsByCatId = new Map<number, MenuItem[]>();
    for (const item of items) {
        const list = itemsByCatId.get(item.category_id) ?? [];
        list.push(item);
        itemsByCatId.set(item.category_id, list);
    }
    const directItems = itemsByCatId.get(category.id) ?? [];
    // Si aucun item direct, l'indice va à la 1re sous-catégorie non vide
    const hintSubId = hint && directItems.length === 0
        ? category.subcategories?.find(s => (itemsByCatId.get(s.id) ?? []).length > 0)?.id
        : undefined;

    return (
        <div className="space-y-4">
            <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px" style={{ backgroundColor: headerLineColor }} />
                <span className="text-sm font-bold uppercase tracking-widest shrink-0" style={{ color: headerTextColor }}>
                    {category.label}
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: headerLineColor }} />
                {canEdit && editor.menuId && !hasSubcategories && (
                    <div className="absolute right-0">
                        <SubstitutionPopoverButton categoryId={category.id} editor={editor} />
                    </div>
                )}
            </div>

            <div className="space-y-4">
                {directItems.length > 0 || (!hasSubcategories && canEdit) ? (
                    <ItemList items={directItems} actualCategory={category} editor={editor} canEdit={canEdit} hint={hint && directItems.length > 0} />
                ) : null}

                {hasSubcategories && category.subcategories!.map(sub => {
                    const subItems = itemsByCatId.get(sub.id) ?? [];
                    if (subItems.length === 0 && !canEdit) return null;
                    const subColor = getCategoryColor(sub.color_key, sub.order);

                    return (
                        <div key={sub.id} className="space-y-3">
                            {/* Toutes les sous-catégories : label aligné à gauche */}
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: subColor.sectionLabel }}>
                                    {sub.label}
                                </p>
                                {canEdit && editor.menuId && (
                                    <SubstitutionPopoverButton categoryId={sub.id} editor={editor} />
                                )}
                            </div>
                            <ItemList items={subItems} actualCategory={sub} editor={editor} canEdit={canEdit} hint={sub.id === hintSubId} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── AdminCategorySection ─────────────────────────────────────────────────────

export function AdminCategorySection({ category, items, editor, canEdit, hint }: AdminCategorySectionProps) {
    if (category.is_highlighted || (category.subcategories?.length ?? 0) > 0) {
        return <HighlightedSection category={category} items={items} editor={editor} canEdit={canEdit} hint={hint} />;
    }
    return <StandardSection category={category} items={items} editor={editor} canEdit={canEdit} hint={hint} />;
}
