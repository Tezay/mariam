import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogApi, type MenuCategory } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notify } from '@/lib/toast';
import { leafCategories } from './categories';
import { duplicateFrom, type DuplicateDish } from './duplicate';
import { DuplicateNotice } from './ui/DuplicateNotice';

/** Name and category only: photo, labels and certifications are set on the dish page. */
export function DishCreateDialog({
  open,
  categories,
  onClose,
}: {
  open: boolean;
  categories: MenuCategory[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [duplicate, setDuplicate] = useState<DuplicateDish | null>(null);

  const create = useMutation({
    mutationFn: () => catalogApi.create({ name: name.trim(), category_id: categoryId || null }),
    onSuccess: (dish) => {
      queryClient.invalidateQueries({ queryKey: ['catalogue'] });
      setName('');
      setCategoryId('');
      onClose();
      navigate(`/admin/catalogue/${dish.id}`);
    },
    onError: (error) => {
      const existing = duplicateFrom(error);
      setDuplicate(existing);
      if (!existing) notify.error("Le plat n'a pas pu être créé");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau plat</DialogTitle>
          <DialogDescription>
            Vous compléterez la photo et les labels sur la fiche du plat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="new-dish-name" className="mb-1.5 block text-xs text-muted-foreground">
              Nom
            </Label>
            <Input
              id="new-dish-name"
              value={name}
              autoFocus
              onChange={(event) => {
                setName(event.target.value);
                setDuplicate(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && name.trim()) create.mutate();
              }}
              className="h-10"
            />
          </div>
          <div>
            <Label
              htmlFor="new-dish-category"
              className="mb-1.5 block text-xs text-muted-foreground"
            >
              Catégorie
            </Label>
            <select
              id="new-dish-category"
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value ? Number(event.target.value) : '');
                setDuplicate(null);
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Aucune catégorie</option>
              {leafCategories(categories).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
          {duplicate && <DuplicateNotice duplicate={duplicate} />}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Annuler
          </Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Création…' : 'Créer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
