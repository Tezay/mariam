import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, Trash2, Info, AlertTriangle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { inboxApi, type InboxNotification, type LiveAlert } from '@/lib/api';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 15_000;

function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `il y a ${diffH}h`;
    return `il y a ${Math.floor(diffH / 24)}j`;
}

function StoredNotifIcon({ type }: { type: string }) {
    if (type === 'business_alert')
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
    return <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />;
}

const LIVE_ALERT_STYLES: Record<LiveAlert['severity'], string> = {
    error: 'border-l-2 border-red-500 bg-red-50 dark:bg-red-950/20',
    warning: 'border-l-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20',
    info: 'border-l-2 border-blue-500 bg-blue-50 dark:bg-blue-950/20',
};

const LIVE_ALERT_ICON: Record<LiveAlert['severity'], React.ReactNode> = {
    error: <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />,
    info: <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />,
};

export function NotificationBell() {
    const [open, setOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<InboxNotification[]>([]);
    const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchCount = useCallback(async () => {
        try {
            const [count, alerts] = await Promise.all([
                inboxApi.unreadCount(),
                inboxApi.getLiveAlerts(),
            ]);
            setUnreadCount(count);
            setLiveAlerts(alerts);
        } catch {
            // silently ignore polling errors
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const [notifs, alerts] = await Promise.all([
                inboxApi.list(),
                inboxApi.getLiveAlerts(),
            ]);
            setNotifications(notifs);
            setLiveAlerts(alerts);
            setUnreadCount(notifs.filter((n) => !n.is_read).length);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, []);

    // Poll count every 15s
    useEffect(() => {
        fetchCount();
        const id = setInterval(fetchCount, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [fetchCount]);

    // Load full list + live alerts when popover opens
    useEffect(() => {
        if (open) fetchNotifications();
    }, [open, fetchNotifications]);

    const handleMarkRead = async (id: number) => {
        try {
            await inboxApi.markRead(id);
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
            );
            setUnreadCount((c) => Math.max(0, c - 1));
        } catch {
            // ignore
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await inboxApi.markAllRead();
            setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch {
            // ignore
        }
    };

    const handleDelete = async (id: number) => {
        const n = notifications.find((x) => x.id === id);
        try {
            await inboxApi.delete(id);
            setNotifications((prev) => prev.filter((x) => x.id !== id));
            if (n && !n.is_read) setUnreadCount((c) => Math.max(0, c - 1));
        } catch {
            // ignore
        }
    };

    const totalBadge = liveAlerts.length + unreadCount;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-9 w-9"
                    aria-label="Notifications"
                >
                    <Bell className="w-4 h-4" />
                    {totalBadge > 0 && (
                        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground leading-none">
                            {totalBadge > 9 ? '9+' : totalBadge}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>

            <PopoverContent
                align="end"
                sideOffset={8}
                className="w-[380px] p-0 shadow-lg"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold">Notifications</h3>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1.5 text-muted-foreground"
                            onClick={handleMarkAllRead}
                        >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Tout marquer comme lu
                        </Button>
                    )}
                </div>

                {/* List */}
                <div className="max-h-[420px] overflow-y-auto">
                    {loading && notifications.length === 0 && liveAlerts.length === 0 ? (
                        <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
                            Chargement…
                        </div>
                    ) : liveAlerts.length === 0 && notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 h-24 text-muted-foreground">
                            <Bell className="w-7 h-7 opacity-30" />
                            <p className="text-sm">Aucune notification</p>
                        </div>
                    ) : (
                        <>
                            {/* Live alerts */}
                            {liveAlerts.length > 0 && (
                                <ul className="border-b border-border">
                                    {liveAlerts.map((alert) => (
                                        <li
                                            key={alert.key}
                                            className={cn(
                                                'flex gap-3 px-4 py-3',
                                                LIVE_ALERT_STYLES[alert.severity],
                                            )}
                                        >
                                            {LIVE_ALERT_ICON[alert.severity]}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-foreground leading-snug">
                                                    {alert.title}
                                                </p>
                                                {alert.body && (
                                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                        {alert.body}
                                                    </p>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {/* Stored notifications */}
                            {notifications.length > 0 && (
                                <ul className="divide-y divide-border">
                                    {notifications.map((notif) => (
                                        <li
                                            key={notif.id}
                                            className={cn(
                                                'group flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors',
                                                !notif.is_read && 'bg-primary/5',
                                            )}
                                        >
                                            <StoredNotifIcon type={notif.type} />
                                            <div className="flex-1 min-w-0">
                                                <p
                                                    className={cn(
                                                        'text-sm leading-snug',
                                                        !notif.is_read
                                                            ? 'font-medium text-foreground'
                                                            : 'text-muted-foreground',
                                                    )}
                                                >
                                                    {notif.title}
                                                </p>
                                                {notif.body && (
                                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                        {notif.body}
                                                    </p>
                                                )}
                                                <p className="text-xs text-muted-foreground/70 mt-1">
                                                    {relativeTime(notif.created_at)}
                                                </p>
                                            </div>
                                            <div className="flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
                                                {!notif.is_read && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        title="Marquer comme lu"
                                                        onClick={() => handleMarkRead(notif.id)}
                                                    >
                                                        <CheckCheck className="w-3 h-3" />
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                    title="Supprimer"
                                                    onClick={() => handleDelete(notif.id)}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
