/**
 * Composants de l'onglet Catégories : ligne éditable (drag & drop, couleur,
 * mise en avant, suppression) et liste triable.
 */
import { useState, useEffect } from 'react';
import { MenuCategory } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COLOR_KEY_MAP } from '@/lib/category-colors';
import { GripVertical, Star, StarOff, Lock, Trash2, Palette, Check } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export type CategoryPatch = Partial<{
  label: string;
  is_highlighted: boolean;
  color_key: string | null;
}>;

interface CategoryRowProps {
  category: MenuCategory;
  onUpdate: (id: number, data: CategoryPatch) => void;
  onDelete: (id: number) => void;
  indent?: boolean;
}

export function CategoryRow({ category, onUpdate, onDelete, indent = false }: CategoryRowProps) {
  const [label, setLabel] = useState(category.label);
  const hasSubcategories = (category.subcategories?.length ?? 0) > 0;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  const handleLabelBlur = () => {
    if (label.trim() && label !== category.label) {
      onUpdate(category.id, { label: label.trim() });
    }
  };

  useEffect(() => {
    setLabel(category.label);
  }, [category.label]);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform) ?? undefined,
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`rounded-xl bg-muted/50 p-2 sm:p-3 ${indent ? 'ml-4 border-l-2 border-border sm:ml-8' : ''}`}
    >
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Drag handle */}
        <div
          {...listeners}
          {...attributes}
          className="shrink-0 cursor-grab touch-none text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
          aria-label="Réordonner"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Nom */}
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={handleLabelBlur}
          className="min-w-0 flex-1 rounded-xl text-sm"
          placeholder="Nom de la catégorie"
        />

        {/* Actions : masquées sur très petit écran, visibles sinon */}
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          <ActionButtons
            category={category}
            hasSubcategories={hasSubcategories}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        </div>
      </div>

      {/* Actions sur mobile */}
      <div className="mt-1.5 flex items-center justify-end gap-1 border-t border-border/50 pt-1.5 sm:hidden">
        <ActionButtons
          category={category}
          hasSubcategories={hasSubcategories}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

interface ActionButtonsProps {
  category: MenuCategory;
  hasSubcategories: boolean;
  onUpdate: (id: number, data: CategoryPatch) => void;
  onDelete: (id: number) => void;
}

function ActionButtons({ category, hasSubcategories, onUpdate, onDelete }: ActionButtonsProps) {
  return (
    <>
      {/* Palette couleur */}
      {!hasSubcategories ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-xl border-0"
              title="Couleur de la catégorie"
              style={
                category.color_key
                  ? {
                      backgroundColor: COLOR_KEY_MAP[category.color_key]?.bg,
                    }
                  : undefined
              }
            >
              <Palette
                className="h-4 w-4"
                style={{
                  color: category.color_key ? COLOR_KEY_MAP[category.color_key]?.label : undefined,
                }}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="end">
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(COLOR_KEY_MAP).map(([key, color]) => (
                <button
                  key={key}
                  type="button"
                  title={key}
                  onClick={() => onUpdate(category.id, { color_key: key })}
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color.bg,
                    outline: category.color_key === key ? `3px solid ${color.border}` : 'none',
                    outlineOffset: '2px',
                  }}
                >
                  {category.color_key === key && (
                    <Check className="h-4 w-4" style={{ color: color.label }} strokeWidth={3} />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <div className="h-8 w-8 shrink-0" />
      )}

      {/* Mise en avant (highlight) — legacy, probablement retiré prochainement */}
      {!hasSubcategories ? (
        <button
          onClick={() => onUpdate(category.id, { is_highlighted: !category.is_highlighted })}
          title={
            category.is_highlighted
              ? 'Retirer la mise en avant'
              : 'Mettre en avant (items affichés en grand)'
          }
          className={`rounded-xl p-2 transition-colors ${
            category.is_highlighted
              ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
              : 'text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500'
          }`}
        >
          {category.is_highlighted ? (
            <Star className="h-4 w-4 fill-current" />
          ) : (
            <StarOff className="h-4 w-4" />
          )}
        </button>
      ) : (
        <div className="h-8 w-8 shrink-0" />
      )}

      {/* Supprimer */}
      {category.is_protected ? (
        <div
          className="p-2 text-muted-foreground/40"
          title="Cette catégorie ne peut pas être supprimée"
        >
          <Lock className="h-4 w-4" />
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(category.id)}
          className="shrink-0 rounded-xl text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </>
  );
}

interface SortableCatListProps {
  items: MenuCategory[];
  onUpdate: (id: number, data: CategoryPatch) => void;
  onDelete: (id: number) => void;
  onReorderDone: (reordered: MenuCategory[]) => Promise<void>;
  indent?: boolean;
}

export function SortableCatList({
  items,
  onUpdate,
  onDelete,
  onReorderDone,
  indent,
}: SortableCatListProps) {
  const [localItems, setLocalItems] = useState<MenuCategory[]>(items);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = localItems.findIndex((c) => c.id === active.id);
    const toIdx = localItems.findIndex((c) => c.id === over.id);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = arrayMove(localItems, fromIdx, toIdx);
    setLocalItems(reordered);
    await onReorderDone(reordered);
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={localItems.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {localItems.map((cat) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              onUpdate={onUpdate}
              onDelete={onDelete}
              indent={indent}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
