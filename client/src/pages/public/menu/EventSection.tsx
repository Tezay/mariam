import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { isRichTextHtml } from '@/lib/rich-text';
import type { EventData } from '../menu-types';

// The result is injected as HTML: escape before the Markdown rules add their tags.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The editor's HTML is sanitised server side; only rows written before it hold Markdown.
function formatEventDescription(text: string): string {
  if (isRichTextHtml(text)) return text;
  return `<p>${markdownToHtml(text)}</p>`;
}

// Plain tags: the .rich-text class styles them, as it styles the editor's.
function markdownToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

function eventDay(date: string): string {
  const label = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function EventDialog({
  event,
  open,
  onOpenChange,
}: {
  event: EventData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [imgIndex, setImgIndex] = useState(0);
  const images = event.images ?? [];
  const step = (by: number) => setImgIndex((index) => (index + by + images.length) % images.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden border-site-line bg-site-surface p-0 text-site-text sm:rounded-3xl">
        {images.length > 0 && (
          <div className="relative aspect-[4/3] w-full shrink-0 bg-site-placeholder">
            <img src={images[imgIndex].url} alt="" className="h-full w-full object-cover" />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Photo précédente"
                  onClick={() => step(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Photo suivante"
                  onClick={() => step(1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3 overflow-y-auto p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-site-brand">
            <CalendarDays aria-hidden className="h-4 w-4 shrink-0" />
            {eventDay(event.event_date)}
          </p>
          <DialogTitle className="text-xl font-bold leading-snug">{event.title}</DialogTitle>
          {event.subtitle && (
            <DialogDescription className="text-sm text-site-subtle">
              {event.subtitle}
            </DialogDescription>
          )}
          {event.description && (
            <div
              className="rich-text leading-relaxed"
              dangerouslySetInnerHTML={{ __html: formatEventDescription(event.description) }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TodayEvent({ event }: { event: EventData }) {
  const [open, setOpen] = useState(false);
  const image = event.images?.[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-stretch overflow-hidden rounded-[20px] border border-site-line bg-site-surface text-left transition-opacity active:opacity-90"
        style={{ borderLeft: `4px solid ${event.color || '#F5A524'}` }}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
          <span className="w-fit rounded-full bg-[#F5A524] px-2 py-0.5 text-[11px] font-bold text-[#4A2E00]">
            Aujourd'hui
          </span>
          <span className="text-base font-bold leading-snug">{event.title}</span>
          {event.subtitle && <span className="text-sm text-site-subtle">{event.subtitle}</span>}
          {event.description && (
            <span className="flex items-center gap-1 text-sm font-semibold text-site-brand">
              En savoir plus <ChevronRight aria-hidden className="h-4 w-4" />
            </span>
          )}
        </span>
        {image && <img src={image.url} alt="" className="w-28 shrink-0 object-cover" />}
      </button>
      <EventDialog event={event} open={open} onOpenChange={setOpen} />
    </>
  );
}

function EventCard({ event }: { event: EventData }) {
  const [open, setOpen] = useState(false);
  const image = event.images?.[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-[264px] shrink-0 flex-col overflow-hidden rounded-[20px] border border-site-line bg-site-surface text-left transition-opacity active:opacity-90 lg:w-auto"
      >
        {image ? (
          <img src={image.url} alt="" className="h-[140px] w-full object-cover lg:h-[150px]" />
        ) : (
          <span
            aria-hidden
            className="h-1.5 w-full"
            style={{ background: event.color || '#F5A524' }}
          />
        )}
        <span className="flex flex-col gap-1.5 p-3.5 lg:p-4">
          <span className="text-xs text-site-subtle lg:text-[13px]">
            {eventDay(event.event_date)}
          </span>
          <span className="text-[15px] font-bold leading-snug lg:text-base">{event.title}</span>
          {event.subtitle && (
            <span className="text-[13px] text-site-subtle lg:text-sm">{event.subtitle}</span>
          )}
        </span>
      </button>
      <EventDialog event={event} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function EventSection({ upcomingEvents }: { upcomingEvents: EventData[] }) {
  if (upcomingEvents.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 lg:gap-4">
      <h2 className="text-lg font-bold lg:text-2xl lg:tracking-tight">Événements</h2>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(230px,1fr))] lg:gap-4 lg:overflow-visible lg:px-0">
        {upcomingEvents.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
