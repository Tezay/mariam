import { Plus } from 'lucide-react';
import type { MenuItem, MenuCategory } from '@/lib/api';
import { getCategoryColor, HIGHLIGHTED_COLOR } from '@/lib/category-colors';
import { AdminMenuItemCard } from './AdminMenuItemCard';
import type { UseMenuEditorReturn } from './useMenuEditor';

interface AdminCategorySectionProps {
    category: MenuCategory;
    items: MenuItem[];
    editor: UseMenuEditorReturn;
    canEdit: boolean;
}

// ─── ItemList ─────────────────────────────────────────────────────────────────

interface ItemListProps {
    items: MenuItem[];
    actualCategory: MenuCategory;
    editor: UseMenuEditorReturn;
    canEdit: boolean;
}

function ItemList({ items, actualCategory, editor, canEdit }: ItemListProps) {
    const color = actualCategory.is_highlighted
        ? HIGHLIGHTED_COLOR
        : getCategoryColor(actualCategory.color_key, actualCategory.order);

    return (
        <div className="space-y-3">
            {items.map((item, idx) => (
                <AdminMenuItemCard
                    key={item.id ?? `new-${idx}`}
                    item={item}
                    category={actualCategory}
                    editor={editor}
                    canEdit={canEdit}
                />
            ))}

            {canEdit && (
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => editor.addItem(actualCategory.id)}
                    onKeyDown={e => e.key === 'Enter' && editor.addItem(actualCategory.id)}
                    className="rounded-2xl px-3 py-3 border-2 border-dashed cursor-pointer transition-all hover:opacity-90"
                    style={{
                        backgroundColor: color.addBg,
                        borderColor: color.border,
                        borderBottom: `4px solid ${color.border}`,
                    }}
                >
                    <div className="flex items-center justify-center gap-1.5" style={{ color: color.addLabel }}>
                        <Plus className="w-3.5 h-3.5 opacity-60" />
                        <span className="text-xs font-semibold opacity-70">Ajouter un plat</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── StandardSection ──────────────────────────────────────────────────────────

function StandardSection({ category, items, editor, canEdit }: AdminCategorySectionProps) {
    const color = getCategoryColor(category.color_key, category.order);

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ backgroundColor: color.sectionBorder }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: color.sectionLabel }}>
                    {category.label}
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: color.sectionBorder }} />
            </div>

            <ItemList items={items} actualCategory={category} editor={editor} canEdit={canEdit} />
        </div>
    );
}

// ─── HighlightedSection ───────────────────────────────────────────────────────

function HighlightedSection({ category, items, editor, canEdit }: AdminCategorySectionProps) {
    const hasSubcategories = (category.subcategories?.length ?? 0) > 0;

    const itemsByCatId = new Map<number, MenuItem[]>();
    for (const item of items) {
        const list = itemsByCatId.get(item.category_id) ?? [];
        list.push(item);
        itemsByCatId.set(item.category_id, list);
    }
    const directItems = itemsByCatId.get(category.id) ?? [];

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#093EAA]/30" />
                <span className="text-sm font-bold uppercase tracking-widest text-[#093EAA]">
                    {category.label}
                </span>
                <div className="flex-1 h-px bg-[#093EAA]/30" />
            </div>

            {directItems.length > 0 || (!hasSubcategories && canEdit) ? (
                <ItemList items={directItems} actualCategory={category} editor={editor} canEdit={canEdit} />
            ) : null}

            {hasSubcategories && category.subcategories!.map((sub, subIdx) => {
                const subItems = itemsByCatId.get(sub.id) ?? [];
                if (subItems.length === 0 && !canEdit) return null;
                const subColor = sub.is_highlighted
                    ? HIGHLIGHTED_COLOR
                    : getCategoryColor(sub.color_key, sub.order);

                return (
                    <div key={sub.id} className="space-y-3">
                        {subIdx === 0 ? (
                            <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: subColor.sectionLabel }}>
                                {sub.label}
                            </p>
                        ) : (
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px" style={{ backgroundColor: subColor.sectionBorder }} />
                                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: subColor.sectionLabel }}>
                                    {sub.label}
                                </span>
                                <div className="flex-1 h-px" style={{ backgroundColor: subColor.sectionBorder }} />
                            </div>
                        )}
                        <ItemList items={subItems} actualCategory={sub} editor={editor} canEdit={canEdit} />
                    </div>
                );
            })}
        </div>
    );
}

// ─── AdminCategorySection ─────────────────────────────────────────────────────

export function AdminCategorySection({ category, items, editor, canEdit }: AdminCategorySectionProps) {
    if (category.is_highlighted || (category.subcategories?.length ?? 0) > 0) {
        return <HighlightedSection category={category} items={items} editor={editor} canEdit={canEdit} />;
    }
    return <StandardSection category={category} items={items} editor={editor} canEdit={canEdit} />;
}
