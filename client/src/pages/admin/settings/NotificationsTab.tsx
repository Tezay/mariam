/**
 * Onglet Notifications : préférences in-app de l'utilisateur courant
 * (sauvegardées via le bouton Enregistrer global).
 */
import { NotifPreferences } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Info } from 'lucide-react';
import type { SettingsState } from './useSettingsState';

export function NotificationsTab({ state }: { state: SettingsState }) {
  const { prefs, setPrefs } = state;

  const update = (patch: Partial<NotifPreferences>) => {
    if (!prefs) return;
    setPrefs({ ...prefs, ...patch });
  };

  if (!prefs) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notifications in-app</CardTitle>
        <CardDescription>Ces préférences s'appliquent uniquement à votre compte.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Les alertes s'affichent en temps réel dès que vous ouvrez la cloche de notifications.
        </div>

        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Menu du jour
          </p>
          <label className="group flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={prefs.notify_menu_unpublished}
              onChange={(e) => update({ notify_menu_unpublished: e.target.checked })}
              className="mt-0.5 rounded border-border accent-primary"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Alerter si le menu n'est pas publié
              </p>
              <p className="text-xs text-muted-foreground">
                Visible dans la cloche dès l'ouverture de l'interface.
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={prefs.notify_menu_during_service}
              onChange={(e) => update({ notify_menu_during_service: e.target.checked })}
              className="mt-0.5 rounded border-border accent-primary"
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                Alerte urgente pendant les heures de service
              </p>
              <p className="text-xs text-muted-foreground">
                Signale en rouge si le service est en cours et le menu non publié.
              </p>
            </div>
          </label>
        </div>

        <div className="h-px bg-border" />

        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Jours fériés
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={prefs.notify_holiday_approaching}
              onChange={(e) => update({ notify_holiday_approaching: e.target.checked })}
              className="mt-0.5 rounded border-border accent-primary"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                Alerter si un jour férié approche
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={prefs.holiday_alert_days_before}
                onChange={(e) =>
                  update({
                    holiday_alert_days_before: Math.max(
                      1,
                      Math.min(30, parseInt(e.target.value) || 5)
                    ),
                  })
                }
                disabled={!prefs.notify_holiday_approaching}
                className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
              />
              <span className="whitespace-nowrap text-xs text-muted-foreground">jours avant</span>
            </div>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
