import { Plus } from 'lucide-react';
import type { MenuItem, MenuCategory } from '@/lib/api';
import { getCategoryColor } from '@/lib/category-colors';
import { WeekMenuItemBox } from './WeekMenuItemBox';
import type { UseMenuEditorReturn } from '../day/useMenuEditor';
import type { CategoryColor } from '@/lib/category-colors';

interface WeekCategoryBoxProps {
    category: MenuCategory;
    items: MenuItem[];
    editor: UseMenuEditorReturn;
    canEdit: boolean;
    selectionMode: boolean;
    isSelected: (itemId: number) => boolean;
    onToggleItem: (item: MenuItem) => void;
    date: string;
}

export function WeekCategoryBox({
    category,
    items,
    editor,
    canEdit,
    selectionMode,
    isSelected,
    onToggleItem,
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

    const renderItemList = (itemList: MenuItem[], itemColor: CategoryColor) =>
        itemList.map(item => (
            <WeekMenuItemBox
                key={item.id}
                item={item}
                color={itemColor}
                canEdit={canEdit}
                selectionMode={selectionMode}
                isSelected={item.id !== undefined && isSelected(item.id)}
                onNameChange={name => editor.updateItem(item.id!, { name })}
                onRemove={() => editor.removeItem(item.id!)}
                onToggleSelect={() => onToggleItem(item)}
            />
        ));

    const renderAddButton = (catId: number, btnColor: CategoryColor, label: string, compact = false) =>
        canEdit && (
            <div
                role="button"
                tabIndex={0}
                onClick={() => editor.addItem(catId)}
                onKeyDown={e => e.key === 'Enter' && editor.addItem(catId)}
                className={`w-full flex items-center justify-center gap-1 rounded-xl transition-colors cursor-pointer border-dashed border ${compact ? 'py-1 text-[10px] font-medium' : 'py-1.5 text-[11px] font-medium border-2'}`}
                style={{
                    backgroundColor: btnColor.addBg,
                    borderColor: btnColor.border + (compact ? '60' : '80'),
                    color: btnColor.addLabel,
                }}
            >
                <Plus className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                {label}
            </div>
        );

    return (
        <div className="space-y-1">
            {/* Category header — horizontal lines + centered label */}
            <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1" style={{ backgroundColor: headerLineColor + '60' }} />
                <span
                    className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                    style={{ color: headerTextColor }}
                >
                    {category.label}
                </span>
                <div className="h-px flex-1" style={{ backgroundColor: headerLineColor + '60' }} />
            </div>

            {!hasSubcategories ? (
                /* No subcategories: flat list + single add button */
                <>
                    <div className="space-y-0.5">
                        {renderItemList(items, color)}
                    </div>
                    {renderAddButton(category.id, color, 'Ajouter un plat')}
                </>
            ) : (
                /* Has subcategories: direct parent items first, then each subcategory */
                <>
                    {(itemsByCatId.get(category.id) ?? []).length > 0 && (
                        <div className="space-y-0.5">
                            {renderItemList(itemsByCatId.get(category.id) ?? [], color)}
                        </div>
                    )}
                    {subcategories.map(sub => {
                        const subItems = itemsByCatId.get(sub.id) ?? [];
                        if (subItems.length === 0 && !canEdit) return null;
                        const subColor = getCategoryColor(sub.color_key, sub.order);
                        return (
                            <div key={sub.id} className="space-y-0.5">
                                <p
                                    className="text-[9px] font-bold uppercase tracking-widest px-1 pt-0.5"
                                    style={{ color: subColor.sectionLabel }}
                                >
                                    {sub.label}
                                </p>
                                {renderItemList(subItems, subColor)}
                                {renderAddButton(sub.id, subColor, sub.label, true)}
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
}
