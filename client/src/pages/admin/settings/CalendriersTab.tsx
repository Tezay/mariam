/**
 * Onglet Calendriers : affichage des jours fériés et vacances scolaires
 * (sauvegardé via le bouton Enregistrer global) + création de fermetures
 * exceptionnelles en masse (action immédiate).
 */
import { useState } from 'react';
import {
  adminApi,
  closuresApi,
  menusApi,
  CalendarSettings,
  VacanceScolaire,
  JourFerie,
} from '@/lib/api';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Info, Calendar, GraduationCap } from 'lucide-react';
import type { SettingsState } from './useSettingsState';

export function CalendriersTab({ state }: { state: SettingsState }) {
  const { calendarSettings: settings, setCalendarSettings } = state;
  const currentYear = new Date().getFullYear();

  // Jours fériés closures
  const [feriesYear, setFeriesYear] = useState(currentYear);
  const [feries, setFeries] = useState<JourFerie[] | null>(null);
  const [isLoadingFeries, setIsLoadingFeries] = useState(false);
  const [selectedFeries, setSelectedFeries] = useState<Set<string>>(new Set());

  // Vacances scolaires closures
  const [vacanceYear, setVacanceYear] = useState(currentYear);
  const [vacances, setVacances] = useState<VacanceScolaire[] | null>(null);
  const [isLoadingVacances, setIsLoadingVacances] = useState(false);
  const [selectedVacances, setSelectedVacances] = useState<Set<string>>(new Set());

  // Shared confirm dialog
  const [confirmTarget, setConfirmTarget] = useState<'feries' | 'vacances' | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const update = (patch: Partial<CalendarSettings>) => {
    if (!settings) return;
    setCalendarSettings({ ...settings, ...patch });
  };

  const handleLoadFeries = async () => {
    setIsLoadingFeries(true);
    setFeries(null);
    setSelectedFeries(new Set());
    try {
      const data = await menusApi.getJoursFeries(feriesYear);
      setFeries(data);
      setSelectedFeries(new Set(data.map((f) => f.date)));
    } catch {
      notify.error('Impossible de charger les jours fériés');
    } finally {
      setIsLoadingFeries(false);
    }
  };

  const handleLoadVacances = async () => {
    if (!settings?.school_vacation_zone) return;
    setIsLoadingVacances(true);
    setVacances(null);
    setSelectedVacances(new Set());
    try {
      const data = await adminApi.getVacancesScolaires(vacanceYear, settings.school_vacation_zone);
      setVacances(data);
      setSelectedVacances(new Set(data.map((v) => v.start_date)));
    } catch {
      notify.error('Impossible de charger les vacances scolaires');
    } finally {
      setIsLoadingVacances(false);
    }
  };

  const handleCreateClosures = async () => {
    setIsCreating(true);
    try {
      if (confirmTarget === 'feries' && feries) {
        const toCreate = feries.filter((f) => selectedFeries.has(f.date));
        for (const f of toCreate) {
          await closuresApi.create({
            start_date: f.date,
            end_date: f.date,
            reason: f.description,
          });
        }
        notify.success(`${toCreate.length} fermeture(s) créée(s)`);
        setFeries(null);
      } else if (confirmTarget === 'vacances' && vacances) {
        const toCreate = vacances.filter((v) => selectedVacances.has(v.start_date));
        for (const v of toCreate) {
          await closuresApi.create({
            start_date: v.start_date,
            end_date: v.end_date,
            reason: v.description,
          });
        }
        notify.success(`${toCreate.length} fermeture(s) créée(s)`);
        setVacances(null);
      }
      setConfirmTarget(null);
    } catch {
      notify.error('Erreur lors de la création des fermetures');
    } finally {
      setIsCreating(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const feriesToCreate = feries?.filter((f) => selectedFeries.has(f.date)) ?? [];
  const vacancesToCreate = vacances?.filter((v) => selectedVacances.has(v.start_date)) ?? [];
  const confirmCount = confirmTarget === 'feries' ? feriesToCreate.length : vacancesToCreate.length;

  return (
    <div className="space-y-4">
      {/* ── Jours fériés ─────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Jours fériés français</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Source : calendrier.api.gouv.fr · Affichés dans la vue annuelle
            </p>
          </div>
          <Switch
            checked={settings.show_public_holidays}
            onCheckedChange={(val) => update({ show_public_holidays: val })}
            aria-label="Afficher les jours fériés"
          />
        </div>

        <div className="space-y-3 border-t border-border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Créer des fermetures
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={feriesYear}
              onChange={(e) => {
                setFeriesYear(parseInt(e.target.value));
                setFeries(null);
              }}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadFeries}
              disabled={isLoadingFeries}
              className="rounded-xl"
            >
              {isLoadingFeries ? 'Chargement…' : 'Charger les données'}
            </Button>
          </div>

          {feries !== null && feries.length === 0 && (
            <p className="text-sm italic text-muted-foreground">
              Aucun jour férié trouvé pour {feriesYear}.
            </p>
          )}

          {feries !== null && feries.length > 0 && (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {feries.map((f) => (
                  <li
                    key={f.date}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                    onClick={() => {
                      const next = new Set(selectedFeries);
                      if (next.has(f.date)) next.delete(f.date);
                      else next.add(f.date);
                      setSelectedFeries(next);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFeries.has(f.date)}
                      readOnly
                      className="pointer-events-none rounded border-border accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.description}</p>
                      <p className="text-xs text-muted-foreground">{f.date}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={selectedFeries.size === 0}
                  onClick={() => setConfirmTarget('feries')}
                  className="gap-2 rounded-xl"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Créer {selectedFeries.size} fermeture
                  {selectedFeries.size > 1 ? 's' : ''}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Vacances scolaires ───────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Vacances scolaires</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Affichées dans la vue annuelle</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <select
              value={settings.school_vacation_zone ?? 'A'}
              onChange={(e) => {
                update({ school_vacation_zone: e.target.value as 'A' | 'B' | 'C' });
                setVacances(null);
              }}
              disabled={!settings.show_school_vacations}
              className="rounded-xl border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
            >
              <option value="A">Zone A</option>
              <option value="B">Zone B</option>
              <option value="C">Zone C</option>
            </select>
            <Switch
              checked={settings.show_school_vacations}
              onCheckedChange={(val) => update({ show_school_vacations: val })}
              aria-label="Afficher les vacances scolaires"
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Créer des fermetures
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={vacanceYear}
              onChange={(e) => {
                setVacanceYear(parseInt(e.target.value));
                setVacances(null);
              }}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>
                  Année scolaire {y}-{y + 1}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadVacances}
              disabled={isLoadingVacances || !settings.school_vacation_zone}
              className="rounded-xl"
            >
              {isLoadingVacances ? 'Chargement…' : 'Charger les données'}
            </Button>
          </div>

          {vacances !== null && vacances.length === 0 && (
            <p className="text-sm italic text-muted-foreground">
              Aucune période trouvée pour cette zone et cette année.
            </p>
          )}

          {vacances !== null && vacances.length > 0 && (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {vacances.map((v) => (
                  <li
                    key={v.start_date}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                    onClick={() => {
                      const next = new Set(selectedVacances);
                      if (next.has(v.start_date)) next.delete(v.start_date);
                      else next.add(v.start_date);
                      setSelectedVacances(next);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedVacances.has(v.start_date)}
                      readOnly
                      className="pointer-events-none rounded border-border accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{v.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.start_date} → {v.end_date}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={selectedVacances.size === 0}
                  onClick={() => setConfirmTarget('vacances')}
                  className="gap-2 rounded-xl"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Créer {selectedVacances.size} fermeture
                  {selectedVacances.size > 1 ? 's' : ''}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Note info ────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Les fermetures créées peuvent être modifiées ou supprimées individuellement depuis le
        calendrier.
      </div>

      {/* ── AlertDialog partagé ───────────────────────────────────────── */}
      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Créer {confirmCount} fermeture{confirmCount > 1 ? 's' : ''} ?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>Les fermetures suivantes seront ajoutées au calendrier :</p>
                <ul className="mt-2 space-y-0.5">
                  {confirmTarget === 'feries'
                    ? feriesToCreate.map((f) => (
                        <li key={f.date} className="text-sm">
                          · {f.description} ({f.date})
                        </li>
                      ))
                    : vacancesToCreate.map((v) => (
                        <li key={v.start_date} className="text-sm">
                          · {v.description} ({v.start_date} → {v.end_date})
                        </li>
                      ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateClosures} disabled={isCreating}>
              {isCreating ? 'Création…' : 'Confirmer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
