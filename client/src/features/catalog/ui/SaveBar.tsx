import { Button } from '@/components/ui/button';
import { plural } from '@/features/analytics/format';

export function SaveBar({
  changes,
  saving,
  disabled,
  onSave,
  onCancel,
}: {
  changes: number;
  saving: boolean;
  disabled?: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (changes === 0) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {changes} {plural(changes, 'modification')} non {plural(changes, 'enregistrée')}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={onSave} disabled={saving || disabled}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
}
