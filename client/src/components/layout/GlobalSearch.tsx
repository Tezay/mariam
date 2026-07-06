import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search, BookOpen, CalendarDays, CalendarOff, X,
    ChefHat, Users, Settings, Shield, CornerDownRight,
} from 'lucide-react';
import { catalogApi, eventsApi, closuresApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type SearchResult =
    | { kind: 'page'; label: string; to: string; icon: ReactNode }
    | { kind: 'dish'; id: number; label: string }
    | { kind: 'event'; id: number; label: string; date: string }
    | { kind: 'closure'; id: number; label: string; date: string }
    | { kind: 'date'; label: string; date: string };

// Pages accessibles (navigation rapide, style command-palette)
const PAGES: { label: string; to: string; icon: ReactNode; adminOnly?: boolean }[] = [
    { label: 'Calendrier', to: '/admin/calendar', icon: <CalendarDays className="w-4 h-4 text-muted-foreground" /> },
    { label: 'Service en cours', to: '/admin/service', icon: <ChefHat className="w-4 h-4 text-muted-foreground" /> },
    { label: 'Catalogue', to: '/admin/catalogue', icon: <BookOpen className="w-4 h-4 text-muted-foreground" /> },
    { label: 'Utilisateurs', to: '/admin/users', icon: <Users className="w-4 h-4 text-muted-foreground" />, adminOnly: true },
    { label: 'Paramètres', to: '/admin/settings', icon: <Settings className="w-4 h-4 text-muted-foreground" />, adminOnly: true },
    { label: "Logs d'audit", to: '/admin/audit-logs', icon: <Shield className="w-4 h-4 text-muted-foreground" />, adminOnly: true },
];

const DAY_FR: Record<string, number> = {
    lundi: 1, mardi: 2, mercredi: 3, jeudi: 4,
    vendredi: 5, samedi: 6, dimanche: 0,
};
const MONTH_FR: Record<string, number> = {
    janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
    juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
};

function toYMD(d: Date): string {
    return d.toISOString().split('T')[0];
}

function parseDateFR(q: string): string | null {
    const low = q.trim().toLowerCase();
    const today = new Date();

    if (low === "aujourd'hui" || low === 'auj') return toYMD(today);

    if (low === 'demain') {
        const d = new Date(today);
        d.setDate(d.getDate() + 1);
        return toYMD(d);
    }

    if (DAY_FR[low] !== undefined) {
        const target = DAY_FR[low];
        const d = new Date(today);
        const diff = ((target - d.getDay()) + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        return toYMD(d);
    }

    // "23 juin" or "23 juin 2026"
    const m = low.match(/^(\d{1,2})\s+([a-zé]+)(?:\s+(\d{4}))?$/);
    if (m) {
        const day = parseInt(m[1], 10);
        const month = MONTH_FR[m[2]];
        const year = m[3] ? parseInt(m[3], 10) : today.getFullYear();
        if (month !== undefined && day >= 1 && day <= 31) {
            const d = new Date(year, month, day);
            if (!isNaN(d.getTime())) return toYMD(d);
        }
    }

    return null;
}

function useDebounce<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return debounced;
}

export function GlobalSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    const debouncedQuery = useDebounce(query, 300);

    const doSearch = useCallback(async (q: string) => {
        if (q.trim().length < 2) {
            setResults([]);
            setOpen(false);
            return;
        }

        setLoading(true);
        const ql = q.trim().toLowerCase();
        const next: SearchResult[] = [];

        // Navigation rapide (synchrone, en tête)
        for (const p of PAGES) {
            if (p.adminOnly && !isAdmin) continue;
            if (p.label.toLowerCase().includes(ql)) {
                next.push({ kind: 'page', label: p.label, to: p.to, icon: p.icon });
            }
        }

        const date = parseDateFR(q);
        if (date) {
            next.push({ kind: 'date', label: q, date });
        }

        const [dishes, events, closures] = await Promise.allSettled([
            catalogApi.list({ q: q.trim() }),
            eventsApi.list(false, undefined, false),
            closuresApi.list(),
        ]);

        if (closures.status === 'fulfilled') {
            let count = 0;
            for (const c of closures.value) {
                const hay = `${c.reason ?? ''} ${c.description ?? ''}`.toLowerCase();
                if (hay.includes(ql) && count < 4) {
                    next.push({ kind: 'closure', id: c.id, label: c.reason || 'Fermeture', date: c.start_date });
                    count++;
                }
            }
        }

        if (dishes.status === 'fulfilled') {
            for (const d of dishes.value.slice(0, 5)) {
                next.push({ kind: 'dish', id: d.id, label: d.name });
            }
        }

        if (events.status === 'fulfilled') {
            let eventCount = 0;
            for (const e of events.value) {
                if (e.title.toLowerCase().includes(ql) && eventCount < 3) {
                    next.push({ kind: 'event', id: e.id, label: e.title, date: e.event_date });
                    eventCount++;
                }
            }
        }

        setResults(next);
        setOpen(next.length > 0);
        setActiveIndex(-1);
        setLoading(false);
    }, [isAdmin]);

    useEffect(() => {
        doSearch(debouncedQuery);
    }, [debouncedQuery, doSearch]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSelect = (result: SearchResult) => {
        setQuery('');
        setOpen(false);
        if (result.kind === 'page') {
            navigate(result.to);
        } else if (result.kind === 'dish') {
            navigate(`/admin/catalogue/${result.id}`);
        } else if (result.kind === 'event') {
            navigate('/admin/events');
        } else if (result.kind === 'closure' || result.kind === 'date') {
            navigate(`/admin/calendar?date=${result.date}`);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open || results.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, -1));
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            handleSelect(results[activeIndex]);
        } else if (e.key === 'Escape') {
            setOpen(false);
            setQuery('');
        }
    };

    const grouped = {
        pages: results.filter((r): r is Extract<SearchResult, { kind: 'page' }> => r.kind === 'page'),
        dates: results.filter((r): r is Extract<SearchResult, { kind: 'date' }> => r.kind === 'date'),
        closures: results.filter((r): r is Extract<SearchResult, { kind: 'closure' }> => r.kind === 'closure'),
        dishes: results.filter((r): r is Extract<SearchResult, { kind: 'dish' }> => r.kind === 'dish'),
        events: results.filter((r): r is Extract<SearchResult, { kind: 'event' }> => r.kind === 'event'),
    };

    let idx = -1;

    return (
        <div ref={containerRef} className="relative">
            <div className="relative flex items-center">
                <Search className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    placeholder="Rechercher…"
                    className={cn(
                        'h-8 w-48 md:w-64 rounded-xl border border-input bg-background',
                        'pl-8 pr-7 text-sm placeholder:text-muted-foreground',
                        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
                        'transition-all duration-150',
                    )}
                />
                {query && (
                    <button
                        onClick={() => {
                            setQuery('');
                            setOpen(false);
                            inputRef.current?.focus();
                        }}
                        className="absolute right-2 text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
                {loading && (
                    <span className="absolute right-2 w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
            </div>

            {open && results.length > 0 && (
                <div className="absolute top-full mt-1.5 left-0 w-[340px] z-50 bg-popover border border-border rounded-xl shadow-lg py-1 overflow-hidden">
                    {grouped.pages.length > 0 && (
                        <SearchSection label="Aller à">
                            {grouped.pages.map((r) => {
                                idx++;
                                const i = idx;
                                return (
                                    <ResultRow
                                        key={`page-${r.to}`}
                                        icon={r.icon}
                                        label={r.label}
                                        active={activeIndex === i}
                                        onClick={() => handleSelect(r)}
                                        trailing={<CornerDownRight className="w-3.5 h-3.5 text-muted-foreground/40" />}
                                    />
                                );
                            })}
                        </SearchSection>
                    )}

                    {grouped.dates.length > 0 && (
                        <SearchSection label="Date">
                            {grouped.dates.map((r) => {
                                idx++;
                                const i = idx;
                                return (
                                    <ResultRow
                                        key={`date-${r.date}`}
                                        icon={<CalendarDays className="w-4 h-4 text-primary" />}
                                        label={r.label}
                                        sub={r.date}
                                        active={activeIndex === i}
                                        onClick={() => handleSelect(r)}
                                    />
                                );
                            })}
                        </SearchSection>
                    )}

                    {grouped.closures.length > 0 && (
                        <SearchSection label="Fermetures">
                            {grouped.closures.map((r) => {
                                idx++;
                                const i = idx;
                                return (
                                    <ResultRow
                                        key={`closure-${r.id}`}
                                        icon={<CalendarOff className="w-4 h-4 text-muted-foreground" />}
                                        label={r.label}
                                        sub={r.date}
                                        active={activeIndex === i}
                                        onClick={() => handleSelect(r)}
                                    />
                                );
                            })}
                        </SearchSection>
                    )}

                    {grouped.dishes.length > 0 && (
                        <SearchSection label="Catalogue">
                            {grouped.dishes.map((r) => {
                                idx++;
                                const i = idx;
                                return (
                                    <ResultRow
                                        key={`dish-${r.id}`}
                                        icon={<BookOpen className="w-4 h-4 text-muted-foreground" />}
                                        label={r.label}
                                        active={activeIndex === i}
                                        onClick={() => handleSelect(r)}
                                    />
                                );
                            })}
                        </SearchSection>
                    )}

                    {grouped.events.length > 0 && (
                        <SearchSection label="Événements">
                            {grouped.events.map((r) => {
                                idx++;
                                const i = idx;
                                return (
                                    <ResultRow
                                        key={`event-${r.id}`}
                                        icon={<CalendarDays className="w-4 h-4 text-muted-foreground" />}
                                        label={r.label}
                                        sub={r.date}
                                        active={activeIndex === i}
                                        onClick={() => handleSelect(r)}
                                    />
                                );
                            })}
                        </SearchSection>
                    )}
                </div>
            )}
        </div>
    );
}

function SearchSection({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {label}
            </p>
            {children}
        </div>
    );
}

function ResultRow({
    icon,
    label,
    sub,
    active,
    onClick,
    trailing,
}: {
    icon: React.ReactNode;
    label: string;
    sub?: string;
    active: boolean;
    onClick: () => void;
    trailing?: React.ReactNode;
}) {
    return (
        <button
            className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
            )}
            onClick={onClick}
        >
            {icon}
            <span className="flex-1 min-w-0">
                <span className="block text-sm truncate">{label}</span>
                {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
            </span>
            {trailing}
        </button>
    );
}
