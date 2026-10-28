import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { Site } from '@/lib/api/sites';
import { cn } from '@/lib/utils';

type Photo = Site['photos'][number];

// A phone shows three tiles, a wide screen four; the last says how many photos remain.
const SHOWN = { phone: 3, wide: 4 };

function visibility(index: number, count: number): string {
  const onPhone = count <= SHOWN.phone || index < SHOWN.phone - 1;
  const onWide = count <= SHOWN.wide || index < SHOWN.wide - 1;
  return cn(onPhone ? 'block' : 'hidden', onWide ? 'lg:block' : 'lg:hidden');
}

const TILE = 'h-[88px] w-full overflow-hidden rounded-[14px] lg:h-[130px] lg:rounded-2xl';

export function Gallery({ photos }: { photos: Photo[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const count = photos.length;
  const step = (by: number) =>
    setOpen((index) => (index === null ? index : (index + by + count) % count));

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 lg:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] lg:gap-3">
        {photos.slice(0, SHOWN.wide).map((photo, index) => (
          <li key={photo.url} className={visibility(index, count)}>
            <button type="button" onClick={() => setOpen(index)} className={TILE}>
              <img src={photo.url} alt={photo.alt} className="h-full w-full object-cover" />
            </button>
          </li>
        ))}
        {count > SHOWN.phone && (
          <li className="lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(SHOWN.phone - 1)}
              className={cn(TILE, 'bg-site-brand-soft text-[13px] font-bold text-site-brand')}
            >
              + {count - (SHOWN.phone - 1)} photos
            </button>
          </li>
        )}
        {count > SHOWN.wide && (
          <li className="hidden lg:block">
            <button
              type="button"
              onClick={() => setOpen(SHOWN.wide - 1)}
              className={cn(TILE, 'bg-site-brand-soft text-sm font-bold text-site-brand')}
            >
              + {count - (SHOWN.wide - 1)} photos
            </button>
          </li>
        )}
      </ul>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        {open !== null && (
          <DialogContent
            className="max-w-3xl gap-3 border-site-line bg-site-surface p-4 text-site-text sm:rounded-3xl"
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') step(-1);
              if (event.key === 'ArrowRight') step(1);
            }}
          >
            <DialogTitle className="sr-only">
              Photo {open + 1} sur {count}
            </DialogTitle>
            <img
              src={photos[open].url}
              alt={photos[open].alt}
              className="max-h-[70vh] w-full rounded-2xl bg-site-placeholder object-contain"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Photo précédente"
                onClick={() => step(-1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-site-raised"
              >
                <ChevronLeft aria-hidden className="h-5 w-5" />
              </button>
              <DialogDescription className="min-w-0 flex-1 text-center text-sm text-site-subtle">
                {photos[open].alt}
                <span className="ml-2 tabular-nums">
                  {open + 1}/{count}
                </span>
              </DialogDescription>
              <button
                type="button"
                aria-label="Photo suivante"
                onClick={() => step(1)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-site-raised"
              >
                <ChevronRight aria-hidden className="h-5 w-5" />
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
