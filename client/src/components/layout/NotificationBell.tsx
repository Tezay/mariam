import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Info, AlertTriangle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { inboxApi, type LiveAlert } from '@/lib/api/inbox';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 15_000;

const LIVE_ALERT_STYLES: Record<LiveAlert['severity'], string> = {
  error: 'border-l-2 border-red-500 bg-red-50 dark:bg-red-950/20',
  warning: 'border-l-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20',
  info: 'border-l-2 border-blue-500 bg-blue-50 dark:bg-blue-950/20',
};

const LIVE_ALERT_ICON: Record<LiveAlert['severity'], React.ReactNode> = {
  error: <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />,
  warning: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />,
  info: <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />,
};

function AlertText({ alert }: { alert: LiveAlert }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium leading-snug text-foreground">{alert.title}</p>
      {alert.body && (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{alert.body}</p>
      )}
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      setLiveAlerts(await inboxApi.getLiveAlerts());
    } catch {
      // A failed poll keeps what the bell already shows.
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchAlerts().finally(() => setLoading(false));
  }, [open, fetchAlerts]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {liveAlerts.length > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold leading-none text-destructive-foreground">
              {liveAlerts.length > 9 ? '9+' : liveAlerts.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[380px] p-0 shadow-lg">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {loading && liveAlerts.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              Chargement…
            </div>
          ) : liveAlerts.length === 0 ? (
            <div className="flex h-24 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Bell className="h-7 w-7 opacity-30" />
              <p className="text-sm">Aucune notification</p>
            </div>
          ) : (
            <ul>
              {liveAlerts.map((alert) => {
                // An alert spanning several sites is a director's: send him
                // where their state is listed.
                const grouped = alert.site_names.length > 1;
                return (
                  <li
                    key={alert.key}
                    className={cn('flex gap-3', LIVE_ALERT_STYLES[alert.severity])}
                  >
                    {grouped ? (
                      <Link
                        to="/org/sites"
                        onClick={() => setOpen(false)}
                        className="flex min-w-0 flex-1 gap-3 px-4 py-3 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                      >
                        {LIVE_ALERT_ICON[alert.severity]}
                        <AlertText alert={alert} />
                      </Link>
                    ) : (
                      <div className="flex min-w-0 flex-1 gap-3 px-4 py-3">
                        {LIVE_ALERT_ICON[alert.severity]}
                        <AlertText alert={alert} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
