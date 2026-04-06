import { useState } from 'react';
import { CalendarClock, ChevronRight, X, Calendar, Megaphone, ChevronLeft } from 'lucide-react';
import { generateEventPalette } from '@/lib/color-utils';
import type { EventData } from '../menu-types';

// ─── Utilitaires ────────────────────────────────────────────────────────────

function formatEventDescription(text: string): string {
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-4 mb-1">$1</h3>')
        .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
        .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
        .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
        .replace(/(<li.*<\/li>\n?)+/g, m => `<ul class="my-2 space-y-1">${m}</ul>`)
        .replace(/\n{2,}/g, '</p><p class="mt-3">')
        .replace(/\n/g, '<br/>');
}

// ─── Overlay détail événement ────────────────────────────────────────────────

function MobileEventDetailOverlay({ event, onClose }: { event: EventData; onClose: () => void }) {
    const [imgIndex, setImgIndex] = useState(0);
    const palette = generateEventPalette(event.color || '#3498DB');
    const hasImages = event.images && event.images.length > 0;

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white animate-in slide-in-from-bottom duration-300">
            <div
                className="shrink-0 px-4 py-3 flex items-center justify-between border-b"
                style={{ backgroundColor: palette.bg, borderColor: palette.border }}
            >
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold truncate" style={{ color: palette.text }}>{event.title}</h2>
                    {event.subtitle && (
                        <p className="text-sm truncate" style={{ color: palette.textMuted }}>{event.subtitle}</p>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-2 rounded-full hover:bg-black/10 transition-colors ml-2 shrink-0"
                >
                    <X className="w-5 h-5" style={{ color: palette.text }} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {hasImages && (
                    <div className="relative">
                        <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
                            <img src={event.images![imgIndex].url} alt="" className="w-full h-full object-cover transition-opacity duration-300" />
                        </div>
                        {event.images!.length > 1 && (
                            <>
                                <button onClick={() => setImgIndex(prev => (prev - 1 + event.images!.length) % event.images!.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full backdrop-blur-sm transition-colors">
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <button onClick={() => setImgIndex(prev => (prev + 1) % event.images!.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full backdrop-blur-sm transition-colors">
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                                    {event.images!.map((_, i) => (
                                        <button key={i} onClick={() => setImgIndex(i)} className={`w-2 h-2 rounded-full transition-all ${i === imgIndex ? 'bg-white scale-125 shadow' : 'bg-white/50'}`} />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div className="px-5 pt-4 pb-0 flex items-center gap-2" style={{ color: palette.accent }}>
                    <Calendar className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium capitalize">
                        {new Date(event.event_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </span>
                </div>

                {event.description && (
                    <div className="p-5">
                        <div
                            className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: `<p>${formatEventDescription(event.description)}</p>` }}
                        />
                    </div>
                )}
            </div>

            <div className="shrink-0 p-4 border-t bg-white">
                <button
                    onClick={onClose}
                    className="w-full py-3 rounded-xl font-medium text-white transition-colors"
                    style={{ backgroundColor: palette.accent }}
                >
                    Fermer
                </button>
            </div>
        </div>
    );
}

// ─── MobileTodayEvent ────────────────────────────────────────────────────────

export function MobileTodayEvent({ event }: { event: EventData }) {
    const [showDetail, setShowDetail] = useState(false);
    const palette = generateEventPalette(event.color || '#3498DB');
    const hasImages = event.images && event.images.length > 0;

    return (
        <>
            <div
                className={`rounded-2xl overflow-hidden border mb-4 ${event.description ? 'cursor-pointer active:opacity-90' : ''}`}
                style={{ backgroundColor: palette.bg, borderColor: palette.border }}
                onClick={() => event.description && setShowDetail(true)}
            >
                {hasImages && (
                    <div className="w-full h-40 overflow-hidden">
                        <img src={event.images![0].url} alt="" className="w-full h-full object-cover" />
                    </div>
                )}
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <span
                                className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg mb-2"
                                style={{ backgroundColor: palette.button, color: palette.buttonText }}
                            >
                                <Megaphone className="w-3 h-3 inline mr-1" />Aujourd'hui
                            </span>
                            <h3 className="text-lg font-bold leading-tight" style={{ color: palette.text }}>
                                {event.title}
                            </h3>
                            {event.subtitle && (
                                <p className="text-sm mt-0.5" style={{ color: palette.textMuted }}>{event.subtitle}</p>
                            )}
                        </div>
                    </div>
                    {event.description && (
                        <div className="mt-3">
                            <span className="flex items-center gap-1 text-sm font-medium" style={{ color: palette.accent }}>
                                En savoir plus <ChevronRight className="w-4 h-4" />
                            </span>
                        </div>
                    )}
                </div>
            </div>
            {showDetail && <MobileEventDetailOverlay event={event} onClose={() => setShowDetail(false)} />}
        </>
    );
}

// ─── MobileUpcomingEvent ─────────────────────────────────────────────────────

function MobileUpcomingEvent({ event }: { event: EventData }) {
    const [showDetail, setShowDetail] = useState(false);
    const palette = generateEventPalette(event.color || '#3498DB');
    const hasImage = event.images && event.images.length > 0;

    return (
        <>
            <div
                className={`flex items-center gap-3 p-3 rounded-2xl border shadow-sm ${event.description ? 'cursor-pointer active:opacity-90' : ''}`}
                style={{ backgroundColor: palette.bg, borderColor: palette.border }}
                onClick={() => event.description && setShowDetail(true)}
            >
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-base truncate" style={{ color: palette.text }}>{event.title}</p>
                    {event.subtitle && (
                        <p className="text-sm truncate" style={{ color: palette.textMuted }}>{event.subtitle}</p>
                    )}
                    <p className="text-xs mt-1 flex items-center gap-1" style={{ color: palette.accent }}>
                        <CalendarClock className="w-3 h-3" />
                        {new Date(event.event_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    {event.description && (
                        <span className="mt-1.5 flex items-center gap-1 text-xs font-medium" style={{ color: palette.accent }}>
                            En savoir plus <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                    )}
                </div>
                {hasImage && (
                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 shadow border" style={{ borderColor: palette.accent }}>
                        <img src={event.images![0].url} alt="" className="w-full h-full object-cover" />
                    </div>
                )}
            </div>
            {showDetail && <MobileEventDetailOverlay event={event} onClose={() => setShowDetail(false)} />}
        </>
    );
}

// ─── MobileEventSection (export) ─────────────────────────────────────────────

interface MobileEventSectionProps {
    upcomingEvents: EventData[];
}

export function MobileEventSection({ upcomingEvents }: MobileEventSectionProps) {
    if (upcomingEvents.length === 0) return null;

    return (
        <div className="px-4 pb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" />
                À venir
            </p>
            <div className="space-y-3">
                {upcomingEvents.slice(0, 2).map(event => (
                    <MobileUpcomingEvent key={event.id} event={event} />
                ))}
            </div>
        </div>
    );
}
