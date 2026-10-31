import { Clock } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { NotificationPreferences } from '@/lib/push';

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <Label htmlFor={id} className="flex-1 cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-sm font-normal text-site-subtle">{description}</span>
      </Label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-site-brand-solid data-[state=unchecked]:bg-site-subtle/50"
      />
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 pb-2 pl-4">
      <Clock aria-hidden className="h-4 w-4 text-site-subtle" />
      <input
        type="time"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-site-line bg-site-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-site-brand"
      />
    </div>
  );
}

export function PreferencesForm({
  prefs,
  onChange,
}: {
  prefs: NotificationPreferences;
  onChange: (next: NotificationPreferences) => void;
}) {
  const set = (changes: Partial<NotificationPreferences>) => onChange({ ...prefs, ...changes });
  return (
    <div className="divide-y divide-site-line">
      <div>
        <Toggle
          id="notify-today"
          label="Menu du jour"
          description="Notification quotidienne le matin"
          checked={prefs.notify_today_menu}
          onChange={(notify_today_menu) => set({ notify_today_menu })}
        />
        {prefs.notify_today_menu && (
          <TimeField
            label="Heure du menu du jour"
            value={prefs.notify_today_menu_time}
            onChange={(notify_today_menu_time) => set({ notify_today_menu_time })}
          />
        )}
      </div>
      <div>
        <Toggle
          id="notify-tomorrow"
          label="Menu du lendemain"
          description="Rappel la veille au soir"
          checked={prefs.notify_tomorrow_menu}
          onChange={(notify_tomorrow_menu) => set({ notify_tomorrow_menu })}
        />
        {prefs.notify_tomorrow_menu && (
          <TimeField
            label="Heure du menu du lendemain"
            value={prefs.notify_tomorrow_menu_time}
            onChange={(notify_tomorrow_menu_time) => set({ notify_tomorrow_menu_time })}
          />
        )}
      </div>
      <Toggle
        id="notify-events"
        label="Actualités"
        description="Rappels des actualités datées et des fermetures"
        checked={prefs.notify_events}
        onChange={(notify_events) => set({ notify_events })}
      />
    </div>
  );
}
