import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { CapacityDial } from '@/components/CapacityDial';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useSiteRef } from '@/contexts/SiteContext';
import { getApiErrorMessage } from '@/lib/api/errors';
import { sitesApi } from '@/lib/api/sites';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/utils';

const CHOICES = [
  {
    value: 'available',
    label: 'Places disponibles',
    on: 'data-[state=on]:border-green-600 data-[state=on]:bg-green-500/10 data-[state=on]:text-green-700 dark:data-[state=on]:border-green-500 dark:data-[state=on]:text-green-400',
  },
  {
    value: 'reached',
    label: 'Capacité atteinte',
    on: 'data-[state=on]:border-red-600 data-[state=on]:bg-red-500/10 data-[state=on]:text-red-700 dark:data-[state=on]:border-red-500 dark:data-[state=on]:text-red-400',
  },
] as const;

export function CapacityCard({ capacity }: { capacity: number }) {
  const site = useSiteRef();
  const [reached, setReached] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sitesApi
      .getOwnLiveStatus(site)
      .then((status) => setReached(status.capacity_reached))
      .catch(() => {});
  }, [site]);

  const choose = async (next: boolean) => {
    setReached(next);
    setSaving(true);
    try {
      setReached((await sitesApi.setLiveStatus(site, next)).capacity_reached);
    } catch (error) {
      setReached(!next);
      notify.error(getApiErrorMessage(error, "L'état du service n'a pas été enregistré."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        Capacité maximale · {capacity.toLocaleString('fr-FR')} repas
      </p>
      <ToggleGroup
        type="single"
        aria-label="État du service"
        value={reached === null ? '' : reached ? 'reached' : 'available'}
        onValueChange={(value) => value && choose(value === 'reached')}
        disabled={reached === null || saving}
        className="grid grid-cols-2 items-stretch gap-2"
      >
        {CHOICES.map((choice) => (
          <ToggleGroupItem
            key={choice.value}
            value={choice.value}
            className={cn(
              'h-auto flex-col gap-1.5 text-balance rounded-xl border-2 border-border bg-card px-2 py-3 text-sm font-semibold leading-tight text-muted-foreground hover:bg-muted data-[state=on]:font-bold [&_svg]:h-7 [&_svg]:w-12',
              choice.on
            )}
          >
            <CapacityDial state={choice.value} />
            {choice.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">
        La page publique l'indique en direct, jusqu'à la fin du service.
      </p>
    </div>
  );
}
