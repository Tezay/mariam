import { Check, Loader2 } from 'lucide-react';
import type { NotifPreferences } from '@/lib/api/inbox';
import { Switch } from '@/components/ui/switch';

/** What a row shows while its change travels to the server, and just after. */
export type SaveState = { key: keyof NotifPreferences; state: 'saving' | 'saved' } | null;

/**
 * The per-user alert switches, shared by the two places they are edited:
 * `Réglages › Notifications` for a site admin, `Mon compte` for a director,
 * who has no settings page.
 */

interface Rule {
  key: keyof NotifPreferences;
  label: string;
  hint?: string;
  /** Rules a site admin cannot act on are hidden from them. */
  orgOnly?: boolean;
}

const DIGEST_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DIGEST_HOURS = Array.from({ length: 16 }, (_, index) => index + 6);

const GROUPS: { title: string; rules: Rule[] }[] = [
  {
    title: 'Menu',
    rules: [
      {
        key: 'notify_menu_unpublished',
        label: 'Menu du jour non publié',
        hint: 'Uniquement les jours où le service est ouvert.',
      },
      {
        key: 'notify_menu_during_service',
        label: 'Alerte urgente pendant le service',
        hint: "Signale en rouge si le service a commencé et le menu n'est pas visible.",
      },
      {
        key: 'notify_menu_tomorrow',
        label: 'Menu de demain non préparé',
        hint: 'À partir de 16 h.',
      },
    ],
  },
  {
    title: 'Activité',
    rules: [
      {
        key: 'notify_traffic_drop',
        label: 'Chute de fréquentation',
        hint: 'Consultations de la veille très en dessous des mêmes jours précédents.',
      },
      {
        key: 'notify_low_satisfaction',
        label: 'Satisfaction en baisse',
        hint: 'Score de la semaine sous le seuil, à partir de 30 avis.',
      },
      {
        key: 'notify_vote_anomaly',
        label: 'Votes suspects',
        hint: 'Plus de votes que de visiteurs uniques sur une journée.',
      },
      {
        key: 'notify_site_inactive',
        label: 'Site sans activité',
        hint: 'Aucune action enregistrée depuis une semaine.',
        orgOnly: true,
      },
    ],
  },
];

function Saved({ state }: { state: 'saving' | 'saved' }) {
  return state === 'saving' ? (
    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
  ) : (
    <Check
      className="h-3.5 w-3.5 shrink-0"
      style={{ color: 'hsl(var(--color-success))' }}
      aria-label="Enregistré"
    />
  );
}

function Row({
  label,
  hint,
  checked,
  onChange,
  status,
  children,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  status?: 'saving' | 'saved';
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          {label}
          {status && <Saved state={status} />}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export function NotificationPreferences({
  prefs,
  onChange,
  scope,
  saveState,
}: {
  prefs: NotifPreferences;
  onChange: (patch: Partial<NotifPreferences>) => void;
  scope: 'site' | 'org';
  /** Set where preferences save on change, which is the account page. */
  saveState?: SaveState;
}) {
  const statusOf = (key: keyof NotifPreferences) =>
    saveState?.key === key ? saveState.state : undefined;
  return (
    <div className="space-y-6">
      {GROUPS.map((group) => {
        const rules = group.rules.filter((rule) => scope === 'org' || !rule.orgOnly);
        return (
          <div key={group.title} className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </p>
            {rules.map((rule) => (
              <Row
                key={rule.key}
                label={rule.label}
                hint={rule.hint}
                checked={Boolean(prefs[rule.key])}
                status={statusOf(rule.key)}
                onChange={(value) => onChange({ [rule.key]: value })}
              />
            ))}
          </div>
        );
      })}

      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Jours fériés
        </p>
        <Row
          label="Alerter si un jour férié approche"
          checked={prefs.notify_holiday_approaching}
          status={statusOf('notify_holiday_approaching') ?? statusOf('holiday_alert_days_before')}
          onChange={(value) => onChange({ notify_holiday_approaching: value })}
        >
          <div className="flex shrink-0 items-center gap-2">
            <input
              type="number"
              min={1}
              max={30}
              value={prefs.holiday_alert_days_before}
              onChange={(event) =>
                onChange({
                  holiday_alert_days_before: Math.max(
                    1,
                    Math.min(30, parseInt(event.target.value) || 5)
                  ),
                })
              }
              disabled={!prefs.notify_holiday_approaching}
              className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
            />
            <span className="whitespace-nowrap text-xs text-muted-foreground">jours avant</span>
          </div>
        </Row>
      </div>

      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Email
        </p>
        <Row
          label="Résumé hebdomadaire par email"
          hint="Publication, fréquentation, satisfaction, plats de la semaine et alertes ouvertes."
          checked={prefs.weekly_digest}
          status={statusOf('weekly_digest') ?? statusOf('digest_day') ?? statusOf('digest_hour')}
          onChange={(value) => onChange({ weekly_digest: value })}
        />
        {prefs.weekly_digest && (
          <div className="ml-7 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Envoi le</span>
            <select
              value={prefs.digest_day}
              onChange={(event) => onChange({ digest_day: Number(event.target.value) })}
              aria-label="Jour d'envoi"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            >
              {DIGEST_DAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">à</span>
            <select
              value={prefs.digest_hour}
              onChange={(event) => onChange({ digest_hour: Number(event.target.value) })}
              aria-label="Heure d'envoi"
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            >
              {DIGEST_HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              heure de Paris. Le résumé porte toujours sur la dernière semaine complète, du lundi au
              dimanche.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
