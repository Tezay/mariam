import { useState, useEffect, useCallback, useMemo } from 'react';
import { closuresApi, ExceptionalClosure } from '@/lib/api';
import { notify } from '@/lib/toast';
import { parisToday } from '@/lib/date-utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InlineError, getErrorType } from '@/components/InlineError';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  XCircle,
} from 'lucide-react';

interface ClosureFormData {
  isSingleDay: boolean;
  start_date: string;
  end_date: string;
  reason: string;
  description: string;
}

const EMPTY_FORM: ClosureFormData = {
  isSingleDay: true,
  start_date: '',
  end_date: '',
  reason: '',
  description: '',
};

const FR_MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];
const FR_DAYS_SHORT = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateShort(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

function formatDateRange(start: string, end: string): string {
  return start === end
    ? formatDateShort(start)
    : `${formatDateShort(start)} → ${formatDateShort(end)}`;
}

export function ClosuresPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'editor';
  const today = parisToday();

  const [closures, setClosures] = useState<ExceptionalClosure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClosure, setEditingClosure] = useState<ExceptionalClosure | null>(null);
  const [form, setForm] = useState<ClosureFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadClosures = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const all = await closuresApi.list(false, undefined, true);
      setClosures(all);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClosures();
  }, [loadClosures]);

  // ── Calendar helpers ──────────────────────────────────────────────────────

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayJS = new Date(calYear, calMonth, 1).getDay();
  const startPad = (firstDayJS + 6) % 7;

  const monthStart = toISO(calYear, calMonth, 1);
  const monthEnd = toISO(calYear, calMonth, daysInMonth);

  const closuresInMonth = useMemo(
    () => closures.filter((c) => c.start_date <= monthEnd && c.end_date >= monthStart),
    [closures, monthStart, monthEnd]
  );

  const getClosuresForDay = useCallback(
    (dayNum: number): ExceptionalClosure[] => {
      const dateStr = toISO(calYear, calMonth, dayNum);
      return closures.filter((c) => c.start_date <= dateStr && c.end_date >= dateStr);
    },
    [closures, calYear, calMonth]
  );

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalYear((y) => y - 1);
      setCalMonth(11);
    } else setCalMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) {
      setCalYear((y) => y + 1);
      setCalMonth(0);
    } else setCalMonth((m) => m + 1);
  };

  // ── Dialog helpers ────────────────────────────────────────────────────────

  const openCreate = (prefillDate?: string) => {
    setEditingClosure(null);
    setForm({ ...EMPTY_FORM, start_date: prefillDate ?? '' });
    setSaveError(null);
    setIsDialogOpen(true);
  };

  const openEdit = (closure: ExceptionalClosure) => {
    setEditingClosure(closure);
    setForm({
      isSingleDay: closure.start_date === closure.end_date,
      start_date: closure.start_date,
      end_date: closure.end_date,
      reason: closure.reason ?? '',
      description: closure.description ?? '',
    });
    setSaveError(null);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingClosure(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  };

  // ── Save / delete ─────────────────────────────────────────────────────────

  const validateForm = (): string | null => {
    if (!form.start_date) return 'La date de début est requise.';
    if (!form.isSingleDay && !form.end_date) return 'La date de fin est requise.';
    if (!form.isSingleDay && form.end_date < form.start_date)
      return 'La date de fin doit être après la date de début.';
    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    const payload = {
      start_date: form.start_date,
      end_date: form.isSingleDay ? form.start_date : form.end_date,
      reason: form.reason.trim() || undefined,
      description: form.description.trim() || undefined,
    };
    try {
      if (editingClosure) {
        await closuresApi.update(editingClosure.id, payload);
      } else {
        await closuresApi.create(payload);
      }
      closeDialog();
      await loadClosures();
    } catch {
      setSaveError('Erreur lors de la sauvegarde. Veuillez réessayer.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await closuresApi.delete(id);
      await loadClosures();
    } catch {
      notify.error('Impossible de supprimer la fermeture');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="container-mariam space-y-6 py-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CalendarOff className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Fermetures exceptionnelles</h1>
            <p className="text-sm text-muted-foreground">
              Vacances, jours fériés, travaux, grèves…
            </p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={() => openCreate()} className="shrink-0 gap-2">
            <Plus className="h-4 w-4" />
            Nouvelle fermeture
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      )}
      {!isLoading && Boolean(error) && (
        <InlineError type={getErrorType(error)} onRetry={loadClosures} />
      )}

      {!isLoading && !error && (
        <div className="flex flex-col gap-6 md:flex-row">
          {/* ─── Calendrier ─── */}
          <div className="shrink-0 md:w-80 lg:w-96">
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
                  aria-label="Mois précédent"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold text-foreground">
                  {FR_MONTHS[calMonth]} {calYear}
                </span>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
                  aria-label="Mois suivant"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 text-center">
                {FR_DAYS_SHORT.map((d) => (
                  <div key={d} className="py-1 text-xs font-medium text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {Array.from({ length: startPad }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const dateStr = toISO(calYear, calMonth, day);
                  const dayCls = getClosuresForDay(day);
                  const isToday = dateStr === today;
                  const hasClosure = dayCls.length > 0;

                  const firstClosure = dayCls[0];
                  const isStart = firstClosure?.start_date === dateStr;
                  const isEnd = firstClosure?.end_date === dateStr;
                  const isSingle = firstClosure
                    ? firstClosure.start_date === firstClosure.end_date
                    : false;

                  let roundCls = 'rounded-lg';
                  if (firstClosure && !isSingle) {
                    if (isStart) roundCls = 'rounded-l-lg rounded-r-none';
                    else if (isEnd) roundCls = 'rounded-r-lg rounded-l-none';
                    else if (hasClosure) roundCls = 'rounded-none';
                  }

                  return (
                    <div key={day} className="aspect-square p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (hasClosure) openEdit(dayCls[0]);
                          else if (canEdit) openCreate(dateStr);
                        }}
                        disabled={!canEdit && !hasClosure}
                        className={`flex h-full w-full items-center justify-center text-sm transition-colors ${roundCls} ${hasClosure ? 'bg-red-100 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'text-foreground'} ${isToday ? 'ring-2 ring-inset ring-primary' : ''} ${hasClosure ? 'cursor-pointer hover:opacity-80' : canEdit ? 'cursor-pointer hover:bg-muted' : ''} `}
                      >
                        {day}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-4 border-t border-border pt-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-3 w-3 rounded bg-red-100 dark:bg-red-950/40" />
                  Fermeture active
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-3 w-3 rounded ring-2 ring-primary" />
                  Aujourd'hui
                </div>
              </div>
            </div>
          </div>

          {/* ─── Liste du mois ─── */}
          <div className="min-w-0 flex-1">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {FR_MONTHS[calMonth]} {calYear}
            </h2>

            {closuresInMonth.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
                <XCircle className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Aucune fermeture ce mois-ci.</p>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openCreate()}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {closuresInMonth
                  .sort((a, b) => a.start_date.localeCompare(b.start_date))
                  .map((closure) => {
                    const isCurrent = closure.start_date <= today && closure.end_date >= today;
                    const isPast = closure.end_date < today;
                    const isConfirmingDelete = deletingId === closure.id;

                    return (
                      <div
                        key={closure.id}
                        className={`flex items-start gap-3 rounded-xl border bg-card p-4 ${
                          isCurrent
                            ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20'
                            : isPast
                              ? 'opacity-60'
                              : 'border-border'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            {isCurrent && (
                              <Badge className="shrink-0 bg-red-500 text-xs text-white">
                                EN COURS
                              </Badge>
                            )}
                            {!closure.is_active && (
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                Inactive
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-foreground">
                            {formatDateRange(closure.start_date, closure.end_date)}
                          </p>
                          {closure.reason && (
                            <p className="mt-0.5 text-sm text-muted-foreground">{closure.reason}</p>
                          )}
                          {closure.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {closure.description}
                            </p>
                          )}

                          {isConfirmingDelete && (
                            <div className="mt-3 flex gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(closure.id)}
                              >
                                Supprimer
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeletingId(null)}
                              >
                                Annuler
                              </Button>
                            </div>
                          )}
                        </div>

                        {canEdit && !isConfirmingDelete && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(closure)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeletingId(closure.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialog création / édition */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingClosure ? 'Modifier la fermeture' : 'Nouvelle fermeture exceptionnelle'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex overflow-hidden rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isSingleDay: true, end_date: '' }))}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  form.isSingleDay
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Jour unique
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isSingleDay: false }))}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  !form.isSingleDay
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Plage de dates
              </button>
            </div>

            <div className={`grid gap-3 ${form.isSingleDay ? '' : 'grid-cols-2'}`}>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  {form.isSingleDay ? 'Date' : 'Début'}
                </label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {!form.isSingleDay && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Fin</label>
                  <input
                    type="date"
                    value={form.end_date}
                    min={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Raison <span className="font-normal text-muted-foreground">(optionnelle)</span>
              </label>
              <input
                type="text"
                maxLength={100}
                placeholder="Vacances scolaires, Jour férié, Travaux…"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {form.reason.length}/100
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Note <span className="font-normal text-muted-foreground">(optionnelle)</span>
              </label>
              <textarea
                rows={3}
                placeholder="Informations complémentaires…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog} disabled={isSaving}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
