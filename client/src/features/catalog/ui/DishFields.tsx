import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import type { CertificationItem, DietaryTag } from '@/lib/api/taxonomy';
import type { MenuCategory } from '@/lib/api/categories';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { leafCategories } from '../categories';
import type { DishDraft } from '../dish-draft';

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-muted text-muted-foreground hover:border-primary/40'
      )}
    >
      {children}
    </button>
  );
}

export function DishFields({
  draft,
  onChange,
  categories,
  allTags,
  allCerts,
}: {
  draft: DishDraft;
  onChange: (next: DishDraft) => void;
  categories: MenuCategory[];
  allTags: DietaryTag[];
  allCerts: CertificationItem[];
}) {
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((value) => value !== id) : [...list, id];

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="dish-name" className="mb-1.5 block text-xs text-muted-foreground">
          Nom
        </Label>
        <Input
          id="dish-name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          className="h-10"
        />
      </div>

      <div>
        <Label htmlFor="dish-category" className="mb-1.5 block text-xs text-muted-foreground">
          Catégorie
        </Label>
        <select
          id="dish-category"
          value={draft.categoryId ?? ''}
          onChange={(event) =>
            onChange({
              ...draft,
              categoryId: event.target.value ? Number(event.target.value) : null,
            })
          }
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

      {allTags.length > 0 && (
        <div>
          <Label className="mb-2 block text-xs text-muted-foreground">Labels alimentaires</Label>
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <Chip
                key={tag.id}
                active={draft.tagIds.includes(tag.id)}
                onClick={() => onChange({ ...draft, tagIds: toggle(draft.tagIds, tag.id) })}
              >
                {tag.icon && <Icon name={tag.icon as IconName} className="h-3.5 w-3.5 shrink-0" />}
                {tag.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {allCerts.length > 0 && (
        <div>
          <Label className="mb-2 block text-xs text-muted-foreground">Certifications</Label>
          <div className="flex flex-wrap gap-2">
            {allCerts.map((cert) => (
              <Chip
                key={cert.id}
                active={draft.certIds.includes(cert.id)}
                onClick={() => onChange({ ...draft, certIds: toggle(draft.certIds, cert.id) })}
              >
                {cert.logo_filename && (
                  <img
                    src={`/certifications/${cert.logo_filename}`}
                    alt=""
                    className="h-3.5 w-3.5 shrink-0 object-contain"
                  />
                )}
                {cert.name}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
