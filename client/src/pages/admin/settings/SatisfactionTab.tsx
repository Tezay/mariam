import { useEffect, useState } from 'react';
import { Check, Info, SmilePlus } from 'lucide-react';
import { categoriesApi, type MenuCategory } from '@/lib/api/categories';
import { getCategoryColor, type CategoryColor } from '@/lib/category-colors';
import { RATING_LEVELS, RATING_PRESETS, ratingPreset } from '@/features/rating/scale';
import { RatingIcons } from '@/features/rating/RatingIcons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { SettingsState } from './useSettingsState';

/** A category holding subcategories groups them; only its children carry dishes. */
function leavesOf(category: MenuCategory): MenuCategory[] {
  return category.subcategories?.length ? category.subcategories : [category];
}

export function SatisfactionTab({ state }: { state: SettingsState }) {
  const {
    voteEnabled,
    setVoteEnabled,
    voteCategoryIds,
    setVoteCategoryIds,
    voteIconPreset,
    setVoteIconPreset,
  } = state;
  const [categories, setCategories] = useState<MenuCategory[]>([]);

  useEffect(() => {
    categoriesApi
      .list()
      .then((res) => setCategories(res.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  const toggle = (id: number) =>
    setVoteCategoryIds((previous) =>
      previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Satisfaction des étudiants</CardTitle>
        <CardDescription>
          Une question à un tap en fin de menu du jour. Les réponses sont anonymes et ne sont
          visibles que dans vos statistiques.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="flex items-center gap-1.5">
              <SmilePlus className="h-4 w-4" />
              Proposer le vote
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              La carte disparaît de la page publique lorsque le vote est désactivé.
            </p>
          </div>
          <Switch checked={voteEnabled} onCheckedChange={setVoteEnabled} />
        </div>

        <div className={cn('border-t border-border pt-6', !voteEnabled && 'opacity-50')}>
          <Label className="mb-1 block">Icônes proposées aux étudiants</Label>
          <p className="mb-3 text-sm text-muted-foreground">
            Chaque vote retient le jeu d’icônes affiché, ce qui permet de comparer deux
            présentations dans la page Satisfaction.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {RATING_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={!voteEnabled}
                onClick={() => setVoteIconPreset(preset.id)}
                aria-pressed={voteIconPreset === preset.id}
                className={cn(
                  'rounded-xl border-2 p-3 text-left transition-all disabled:pointer-events-none',
                  voteIconPreset === preset.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted'
                )}
              >
                <span className="text-xs font-medium text-foreground">{preset.label}</span>
                {/* Neutral like the student card: a preview that recolours the
                    icons would not show what the site actually serves. */}
                <span className="mt-2 flex items-center justify-around text-muted-foreground">
                  {RATING_LEVELS.map((level) => (
                    <RatingIcons
                      key={level.value}
                      preset={preset}
                      value={level.value}
                      className="h-5 w-5"
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <StudentPreview presetId={voteIconPreset} />
        </div>

        <div className={cn('border-t border-border pt-6', !voteEnabled && 'opacity-50')}>
          <Label className="mb-1 block">Plats proposés au vote</Label>
          <p className="text-sm text-muted-foreground">
            L’étudiant nomme un plat dans chaque catégorie cochée. Sans aucune sélection, la
            question du plat ne lui est pas posée.
          </p>

          {voteCategoryIds.length > 1 && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" />
              {voteCategoryIds.length} catégories cochées : l’étudiant devra faire autant de choix.
            </p>
          )}

          <div className="mt-4 space-y-4">
            {categories.map((category) => {
              const color = getCategoryColor(category.color_key, category.order);
              const leaves = leavesOf(category);
              const isGroup = leaves[0] !== category;

              return (
                <div key={category.id}>
                  {isGroup && (
                    <p
                      className="mb-1.5 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: color.sectionLabel }}
                    >
                      {category.label}
                    </p>
                  )}
                  <div className={cn('space-y-1.5', isGroup && 'pl-3')}>
                    {leaves.map((leaf) => (
                      <CategoryOption
                        key={leaf.id}
                        label={leaf.label}
                        color={getCategoryColor(leaf.color_key, leaf.order)}
                        checked={voteCategoryIds.includes(leaf.id)}
                        disabled={!voteEnabled}
                        onToggle={() => toggle(leaf.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** The public menu is light-only, so the preview keeps its literal colours. */
function StudentPreview({ presetId }: { presetId: string }) {
  const preset = ratingPreset(presetId);
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Aperçu
      </p>
      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-center text-base font-semibold text-gray-800">Ce menu vous a plu ?</p>
        <p className="mt-1 text-center text-xs text-gray-400">
          Votre avis, c'est anonyme, et ça aide votre restaurant.
        </p>
        <div className="mt-4 flex items-stretch justify-center gap-3">
          {RATING_LEVELS.map((level) => (
            <div
              key={level.value}
              className="flex min-h-[76px] flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-gray-100 bg-gray-50 px-2 py-3 text-gray-500"
            >
              <RatingIcons preset={preset} value={level.value} className="h-7 w-7" />
              <span className="text-center text-[11px] font-medium leading-tight">
                {level.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryOption({
  label,
  color,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  color: CategoryColor;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-all',
        'disabled:pointer-events-none',
        checked
          ? 'font-medium text-foreground'
          : 'border-border text-muted-foreground hover:bg-muted'
      )}
      style={
        checked
          ? { borderColor: color.bg, backgroundColor: `${color.bg}14` }
          : { borderLeftColor: color.bg }
      }
    >
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
          !checked && 'border-border'
        )}
        style={checked ? { backgroundColor: color.bg, borderColor: color.bg } : undefined}
      >
        {checked && <Check className="h-3.5 w-3.5" style={{ color: color.label }} />}
      </span>
      {label}
    </button>
  );
}
