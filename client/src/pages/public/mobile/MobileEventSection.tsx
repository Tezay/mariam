import { useState } from 'react';
import { CalendarClock, ChevronRight, X, Calendar, Megaphone, ChevronLeft } from 'lucide-react';
import { generateEventPalette } from '@/lib/color-utils';
import type { EventData } from '../menu-types';

// ─── Utilitaires ────────────────────────────────────────────────────────────

// Escape raw HTML before markdown rendering, since the result is injected via
// dangerouslySetInnerHTML — prevents stored XSS from event descriptions.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatEventDescription(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul class="my-2 space-y-1">${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p class="mt-3">')
    .replace(/\n/g, '<br/>');
}

// ─── Overlay détail événement ────────────────────────────────────────────────

function MobileEventDetailOverlay({ event, onClose }: { event: EventData; onClose: () => void }) {
  const [imgIndex, setImgIndex] = useState(0);
  const palette = generateEventPalette(event.color || '#3498DB');
  const hasImages = event.images && event.images.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white duration-300 animate-in slide-in-from-bottom">
      <div
        className="flex shrink-0 items-center justify-between border-b px-4 py-3"
        style={{ backgroundColor: palette.bg, borderColor: palette.border }}
      >
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold" style={{ color: palette.text }}>
            {event.title}
          </h2>
          {event.subtitle && (
            <p className="truncate text-sm" style={{ color: palette.textMuted }}>
              {event.subtitle}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-2 shrink-0 rounded-full p-2 transition-colors hover:bg-black/10"
        >
          <X className="h-5 w-5" style={{ color: palette.text }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {hasImages && (
          <div className="relative">
            <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
              <img
                src={event.images![imgIndex].url}
                alt=""
                className="h-full w-full object-cover transition-opacity duration-300"
              />
            </div>
            {event.images!.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setImgIndex((prev) => (prev - 1 + event.images!.length) % event.images!.length)
                  }
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setImgIndex((prev) => (prev + 1) % event.images!.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {event.images!.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIndex(i)}
                      className={`h-2 w-2 rounded-full transition-all ${i === imgIndex ? 'scale-125 bg-white shadow' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 px-5 pb-0 pt-4" style={{ color: palette.accent }}>
          <Calendar className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium capitalize">
            {new Date(event.event_date).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
        </div>

        {event.description && (
          <div className="p-5">
            <div
              className="prose prose-sm max-w-none leading-relaxed text-gray-700"
              dangerouslySetInnerHTML={{
                __html: `<p>${formatEventDescription(event.description)}</p>`,
              }}
            />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t bg-white p-4">
        <button
          onClick={onClose}
          className="w-full rounded-xl py-3 font-medium text-white transition-colors"
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
        className={`mb-4 overflow-hidden rounded-2xl border ${event.description ? 'cursor-pointer active:opacity-90' : ''}`}
        style={{ backgroundColor: palette.bg, borderColor: palette.border }}
        onClick={() => event.description && setShowDetail(true)}
      >
        {hasImages && (
          <div className="h-40 w-full overflow-hidden">
            <img src={event.images![0].url} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span
                className="mb-2 inline-block rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                style={{
                  backgroundColor: palette.button,
                  color: palette.buttonText,
                }}
              >
                <Megaphone className="mr-1 inline h-3 w-3" />
                Aujourd'hui
              </span>
              <h3 className="text-lg font-bold leading-tight" style={{ color: palette.text }}>
                {event.title}
              </h3>
              {event.subtitle && (
                <p className="mt-0.5 text-sm" style={{ color: palette.textMuted }}>
                  {event.subtitle}
                </p>
              )}
            </div>
          </div>
          {event.description && (
            <div className="mt-3">
              <span
                className="flex items-center gap-1 text-sm font-medium"
                style={{ color: palette.accent }}
              >
                En savoir plus <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          )}
        </div>
      </div>
      {showDetail && (
        <MobileEventDetailOverlay event={event} onClose={() => setShowDetail(false)} />
      )}
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
        className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${event.description ? 'cursor-pointer active:opacity-90' : ''}`}
        style={{ backgroundColor: palette.bg, borderColor: palette.border }}
        onClick={() => event.description && setShowDetail(true)}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold" style={{ color: palette.text }}>
            {event.title}
          </p>
          {event.subtitle && (
            <p className="truncate text-sm" style={{ color: palette.textMuted }}>
              {event.subtitle}
            </p>
          )}
          <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: palette.accent }}>
            <CalendarClock className="h-3 w-3" />
            {new Date(event.event_date).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          {event.description && (
            <span
              className="mt-1.5 flex items-center gap-1 text-xs font-medium"
              style={{ color: palette.accent }}
            >
              En savoir plus <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        {hasImage && (
          <div
            className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border shadow"
            style={{ borderColor: palette.accent }}
          >
            <img src={event.images![0].url} alt="" className="h-full w-full object-cover" />
          </div>
        )}
      </div>
      {showDetail && (
        <MobileEventDetailOverlay event={event} onClose={() => setShowDetail(false)} />
      )}
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
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
        <CalendarClock className="h-3.5 w-3.5" />À venir
      </p>
      <div className="space-y-3">
        {upcomingEvents.slice(0, 2).map((event) => (
          <MobileUpcomingEvent key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
