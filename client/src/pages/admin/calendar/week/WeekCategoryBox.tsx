import { ArrowLeftRight } from 'lucide-react';
import type { MenuItem, MenuCategory } from '@/lib/api';
import { getCategoryColor } from '@/lib/category-colors';
import { cn } from '@/lib/utils';
import { WeekMenuItemBox } from './WeekMenuItemBox';
import { AddDishCombobox } from '../day/AddDishCombobox';
import { SelectionCheckbox } from '../selection/SelectionCheckbox';
import type { UseSelectionReturn } from '../selection/useSelection';
import type { UseMenuEditorReturn, SubstitutionMap } from '../day/useMenuEditor';
import type { CategoryColor } from '@/lib/category-colors';

interface WeekCategoryBoxProps {
    category: MenuCategory;
    items: MenuItem[];
    editor: UseMenuEditorReturn;
    canEdit: boolean;
    selectionMode: boolean;
    selection: UseSelectionReturn;
    date: string;
    substitutions?: SubstitutionMap;
}

export function WeekCategoryBox({
    category,
    items,
    editor,
    canEdit,
    selectionMode,
    selection,
    date,
    substitutions,
}: WeekCategoryBoxProps) {
    const color = getCategoryColor(category.color_key, category.order);
    const subcategories = category.subcategories ?? [];
    const hasSubcategories = subcategories.length > 0;
    const headerTextColor = hasSubcategories ? '#093EAA' : color.sectionLabel;
    const headerLineColor = hasSubcategories ? '#C5D2F1' : color.sectionBorder;

    // Group items by category_id for subcategory rendering
    const itemsByCatId = new Map<number, MenuItem[]>();
    for (const item of items) {
        const list = itemsByCatId.get(item.category_id) ?? [];
        list.push(item);
        itemsByCatId.set(item.category_id, list);
    }

    const renderItemList = (itemList: MenuItem[], itemColor: CategoryColor) => (
        <div className="space-y-0.5 rounded-xl">
            {itemList.map(item => (
                <WeekMenuItemBox
                    key={item.id}
                    item={item}
                    color={itemColor}
                    canEdit={canEdit}
                    selectionMode={selectionMode}
                    isSelected={item.id !== undefined && selection.isItemSelected(item.id, date)}
                    date={date}
                    onRemove={() => editor.removeItem(item.id!)}
                    onToggleSelect={() => selection.toggleItem({ type: 'item', itemId: item.id!, date, categoryId: item.category_id })}
                />
            ))}
        </div>
    );

    const showAdd = canEdit && !selectionMode;

    // En mode sélection, on garde l'espace du bouton "Ajouter" (rendu invisible)
    const renderAddControl = (catId: number) =>
        canEdit ? (
            <div className={cn(!showAdd && 'invisible pointer-events-none')} aria-hidden={!showAdd}>
                <AddDishCombobox categoryId={catId} editor={editor} compact />
            </div>
        ) : null;

    return (
        <div className="space-y-1">
            {/* Category header — horizontal lines + centered label */}
            <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1" style={{ backgroundColor: headerLineColor + '60' }} />
                {selectionMode ? (
                    <button
                        type="button"
                        onClick={() => selection.toggleGroup(date, items)}
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap rounded-lg px-1 py-0.5 transition-colors hover:bg-muted"
                        style={{ color: headerTextColor }}
                    >
                        <SelectionCheckbox
                            size="sm"
                            state={selection.getGroupState(date, items)}
                            onToggle={() => selection.toggleGroup(date, items)}
                            aria-label={`Sélectionner ${category.label}`}
                        />
                        {category.label}
                    </button>
                ) : (
                    <span
                        className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                        style={{ color: headerTextColor }}
                    >
                        {category.label}
                    </span>
                )}
                <div className="h-px flex-1" style={{ backgroundColor: headerLineColor + '60' }} />
                {(substitutions?.[category.id]?.length ?? 0) > 0 && (
                    <span className="shrink-0 text-orange-500/60" title="Substitut défini">
                        <ArrowLeftRight className="w-3 h-3" />
                    </span>
                )}
            </div>

            {!hasSubcategories ? (
                <>
                    {renderItemList(items, color)}
                    {renderAddControl(category.id)}
                </>
            ) : (
                <>
                    {(itemsByCatId.get(category.id) ?? []).length > 0 &&
                        renderItemList(itemsByCatId.get(category.id) ?? [], color)
                    }
                    {subcategories.map(sub => {
                        const subItems = itemsByCatId.get(sub.id) ?? [];
                        if (subItems.length === 0 && !showAdd) return null;
                        const subColor = getCategoryColor(sub.color_key, sub.order);
                        return (
                            <div key={sub.id}>
                                <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-0.5">
                                    {selectionMode && subItems.length > 0 && (
                                        <SelectionCheckbox
                                            size="sm"
                                            state={selection.getGroupState(date, subItems)}
                                            onToggle={() => selection.toggleGroup(date, subItems)}
                                            aria-label={`Sélectionner ${sub.label}`}
                                        />
                                    )}
                                    <p
                                        className="text-[9px] font-bold uppercase tracking-widest"
                                        style={{ color: subColor.sectionLabel }}
                                    >
                                        {sub.label}
                                    </p>
                                </div>
                                {renderItemList(subItems, subColor)}
                                {renderAddControl(sub.id)}
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
}
