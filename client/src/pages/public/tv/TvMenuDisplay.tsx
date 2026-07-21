/**
 * MARIAM - Affichage public du menu — Mode TV (>= 1920px)
 *
 * Optimisé pour grands écrans (salles à manger, cafétérias).
 */
import { useState, useEffect } from 'react';
import { ExceptionalClosure } from '@/lib/api';
import { generateEventPalette } from '@/lib/color-utils';
import { getCategoryColor, type CategoryColor } from '@/lib/category-colors';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import { InlineError, getErrorType } from '@/components/InlineError';
import {
  RefreshCw,
  ZoomIn,
  ZoomOut,
  CalendarClock,
  Megaphone,
  Calendar,
  ChefHat,
  CalendarOff,
} from 'lucide-react';
import type {
  MenuItemData,
  DisplayCategory,
  MenuResponse,
  EventData,
  CategorySubstitutionData,
} from '../menu-types';
import type { IconName } from 'lucide-react/dynamic';
import { usePublicMenu } from '../use-public-menu';

// ─── Composants TV Images ───────────────────────────────────────────────────

function TvImageCarousel({
  images,
  interval = 4000,
}: {
  images: { id: number; url: string; order: number }[];
  interval?: number;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, interval);
    return () => clearInterval(timer);
  }, [images.length, interval]);

  if (images.length === 0) return null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {images.map((img, i) => (
        <img
          key={img.id}
          src={img.url}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            i === currentIndex ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Composants Événements TV ───────────────────────────────────────────────

function TvTodayEventBanner({ event }: { event: EventData }) {
  const palette = generateEventPalette(event.color || '#3498DB');
  const hasImages = event.images && event.images.length > 0;

  return (
    <div
      className="relative flex w-full shrink-0 items-center gap-10 overflow-hidden border-b px-10 py-8 shadow-sm"
      style={{ backgroundColor: palette.bg, borderColor: palette.border }}
    >
      {hasImages && (
        <div
          className="h-48 w-48 shrink-0 overflow-hidden rounded-2xl border-2 shadow-lg"
          style={{ borderColor: palette.accent }}
        >
          <TvImageCarousel images={event.images!} interval={4000} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-4">
          <span
            className="rounded-xl px-4 py-1.5 text-lg font-bold uppercase tracking-widest"
            style={{ backgroundColor: palette.button, color: palette.buttonText }}
          >
            <Megaphone className="mr-1 inline h-5 w-5" /> Aujourd'hui
          </span>
        </div>
        <h2
          className="mb-2 truncate text-5xl font-extrabold leading-tight"
          style={{ color: palette.text }}
        >
          {event.title}
        </h2>
        {event.subtitle && (
          <p className="truncate text-3xl font-light" style={{ color: palette.textMuted }}>
            {event.subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function TvUpcomingEventFooter({ event }: { event: EventData }) {
  const palette = generateEventPalette(event.color || '#3498DB');
  const hasImage = event.images && event.images.length > 0;

  return (
    <div
      className="flex w-full items-center gap-8 border-t px-10 py-4"
      style={{ backgroundColor: palette.bg, borderColor: palette.border }}
    >
      {hasImage ? (
        <div
          className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border shadow"
          style={{ borderColor: palette.accent }}
        >
          <img src={event.images![0].url} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border shadow"
          style={{ borderColor: palette.accent, backgroundColor: palette.card }}
        >
          <Megaphone className="h-7 w-7" style={{ color: palette.accent }} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-6">
        <span
          className="shrink-0 rounded-xl px-3 py-1 text-base font-bold uppercase tracking-widest"
          style={{ backgroundColor: palette.button, color: palette.buttonText }}
        >
          Prochain événement
        </span>
        <p className="min-w-0 flex-1 truncate text-3xl font-bold" style={{ color: palette.text }}>
          {event.title}
        </p>
        <span
          className="ml-auto flex shrink-0 items-center gap-2 text-2xl"
          style={{ color: palette.accent }}
        >
          <Calendar className="h-5 w-5" />{' '}
          {new Date(event.event_date).toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </span>
      </div>
    </div>
  );
}

function TvTomorrowFooter({ menu }: { menu: MenuResponse }) {
  const firstItem = menu.by_category?.flatMap((cat) =>
    cat.subcategories ? cat.subcategories.flatMap((sub) => sub.items || []) : cat.items || []
  )[0];

  return (
    <div className="flex w-full items-center gap-6 border-t border-gray-200 bg-gray-100/95 px-10 py-4 text-gray-800 backdrop-blur-md">
      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <CalendarClock className="h-8 w-8 text-mariam-blue" />
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-2xl font-bold uppercase tracking-wider text-gray-500">Demain :</span>
        <span className="text-4xl font-bold tracking-tight text-mariam-blue">
          {firstItem?.dish?.name || 'Menu surprise'}
        </span>
      </div>
    </div>
  );
}

function TvChefNoteFooter({ note }: { note: string }) {
  return (
    <div className="flex w-full items-center gap-6 border-t border-amber-200 bg-amber-50/95 px-10 py-4 text-gray-800 backdrop-blur-md">
      <div className="rounded-xl border border-amber-100 bg-white p-3 shadow-sm">
        <ChefHat className="h-8 w-8 text-amber-600" />
      </div>
      <p className="text-3xl font-bold text-amber-700">Note du chef :</p>
      <p className="truncate text-3xl italic leading-snug text-gray-700">« {note} »</p>
    </div>
  );
}

// ─── TvCategoryCard ─────────────────────────────────────────────────────────

function TvCategoryCard({
  category,
  items,
  color,
  renderBadges,
  substitutions,
}: {
  category: DisplayCategory;
  items: MenuItemData[];
  color: CategoryColor;
  renderBadges: (item: MenuItemData) => React.ReactNode;
  substitutions?: CategorySubstitutionData[];
}) {
  const isHighlighted = category.is_highlighted;
  // Plats de substitution : affichés uniquement si un item de la catégorie est en rupture
  const oosPresent = items.some((i) => i.is_out_of_stock);
  const subItems: MenuItemData[] = oosPresent
    ? (substitutions ?? []).map((s) => ({
        dish: s.dish,
        category_id: category.id,
        is_out_of_stock: false,
      }))
    : [];

  // Boîte par plat, reprenant le design mobile (fond coloré + border-bottom 3D)
  // à l'échelle TV.
  const renderBox = (item: MenuItemData, isNew: boolean, key: string) => {
    const isOos = item.is_out_of_stock ?? false;
    const showImage = isHighlighted && !!item.dish?.image_url;
    const badges = renderBadges(item);
    return (
      <li key={key} className={`relative ${badges ? 'mb-8' : ''}`}>
        <div
          className="relative rounded-3xl px-8 py-6"
          style={{ backgroundColor: color.bg, borderBottom: `8px solid ${color.border}` }}
        >
          {isOos && (
            <span className="absolute left-8 top-0 -translate-y-1/2 rounded-full bg-red-500 px-4 py-1 text-xl font-bold uppercase tracking-wide text-white shadow">
              Rupture
            </span>
          )}
          {isNew && (
            <span className="absolute left-8 top-0 -translate-y-1/2 rounded-full bg-[#F5A524] px-4 py-1 text-xl font-bold uppercase tracking-wide text-[#4A2E00] shadow">
              Nouveau
            </span>
          )}
          {showImage && (
            <img
              src={item.dish!.image_url!}
              alt={item.dish?.name ?? ''}
              loading="lazy"
              className="mb-5 h-64 w-full rounded-2xl object-cover"
            />
          )}
          <p
            className={`text-4xl font-bold leading-tight ${isOos ? 'line-through opacity-60' : ''}`}
            style={{ color: color.label }}
          >
            {item.dish?.name ?? ''}
          </p>
          {/* Pastille de labels/certifications à cheval sur le bas de la box */}
          {badges && <div className="absolute bottom-0 right-5 z-20 translate-y-1/2">{badges}</div>}
        </div>
      </li>
    );
  };

  return (
    <section className="flex h-full flex-col gap-7 rounded-3xl border border-gray-100 bg-white p-8 shadow-md">
      {/* En-tête de section : libellé centré entre deux filets (design mobile) */}
      <div className="flex items-center gap-4">
        <div className="h-0.5 flex-1 rounded" style={{ backgroundColor: color.sectionBorder }} />
        <span
          className="text-3xl font-bold uppercase tracking-widest"
          style={{ color: color.sectionLabel }}
        >
          {category.label}
        </span>
        <div className="h-0.5 flex-1 rounded" style={{ backgroundColor: color.sectionBorder }} />
      </div>
      <ul className="flex flex-1 flex-col gap-8">
        {items.map((item, i) => renderBox(item, false, `${item.id ?? item.dish?.id ?? i}`))}
        {subItems.map((item, i) => renderBox(item, true, `sub-${item.dish?.id ?? i}`))}
      </ul>
    </section>
  );
}

// ─── TvClosureDisplay ───────────────────────────────────────────────────────

function TvClosureDisplay({ closure }: { closure: ExceptionalClosure }) {
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const dateLabel =
    closure.start_date === closure.end_date
      ? fmt(closure.start_date)
      : `Du ${fmt(closure.start_date)} au ${fmt(closure.end_date)}`;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 px-20 text-center">
      <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-red-100">
        <CalendarOff className="h-16 w-16 text-red-400" />
      </div>
      <div className="space-y-4">
        <p className="text-7xl font-bold leading-tight text-gray-800">
          {closure.reason ?? 'Fermeture exceptionnelle'}
        </p>
        <p className="text-4xl font-light text-gray-400">{dateLabel}</p>
      </div>
      {closure.description && (
        <p className="max-w-4xl whitespace-pre-line border-t border-gray-200 pt-8 text-3xl font-light leading-relaxed text-gray-500">
          {closure.description}
        </p>
      )}
    </div>
  );
}

// ─── TvMenuDisplay ──────────────────────────────────────────────────────────

export function TvMenuDisplay({ restaurantSlug }: { restaurantSlug: string }) {
  const [footerSlot, setFooterSlot] = useState(0);
  const [isRotated, setIsRotated] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showControls, setShowControls] = useState(false);

  const { data, isPending, isError, error, refetch } = usePublicMenu(restaurantSlug, 'tv');

  const todayData = data?.today ?? null;
  const tomorrowData = data?.tomorrow ?? null;
  const todayEvent = data?.todayEvent ?? null;
  const upcomingEvents = data?.upcomingEvents ?? [];
  const activeClosure = data?.activeClosure ?? null;

  // Rotation écran
  useEffect(() => {
    const root = document.documentElement;
    if (isRotated) {
      root.style.transform = 'rotate(-90deg)';
      root.style.transformOrigin = 'center center';
      root.style.width = '100vh';
      root.style.height = '100vw';
      root.style.overflow = 'hidden';
      root.style.position = 'fixed';
      root.style.top = '50%';
      root.style.left = '50%';
      root.style.translate = '-50% -50%';
    } else {
      root.style.transform = '';
      root.style.transformOrigin = '';
      root.style.width = '';
      root.style.height = '';
      root.style.overflow = '';
      root.style.position = '';
      root.style.top = '';
      root.style.left = '';
      root.style.translate = '';
    }
    return () => {
      root.style.transform = '';
      root.style.transformOrigin = '';
      root.style.width = '';
      root.style.height = '';
      root.style.overflow = '';
      root.style.position = '';
      root.style.top = '';
      root.style.left = '';
      root.style.translate = '';
    };
  }, [isRotated]);

  // Auto-cache contrôles
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const onMouseMove = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };
    onMouseMove();
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      clearTimeout(timeout);
    };
  }, []);

  // Footer rotatif
  const footerSlots: ('event' | 'tomorrow' | 'chefnote')[] = [];
  if (upcomingEvents.length > 0) footerSlots.push('event');
  if (tomorrowData?.menu) footerSlots.push('tomorrow');
  if (todayData?.menu?.chef_note) footerSlots.push('chefnote');
  const footerCount = footerSlots.length;

  useEffect(() => {
    if (footerCount <= 1) return;
    setFooterSlot(0);
    const timer = setInterval(() => setFooterSlot((prev) => (prev + 1) % footerCount), 8000);
    return () => clearInterval(timer);
  }, [footerCount]);

  const tvColorClasses: Record<string, string> = {
    green: 'bg-green-100 text-green-800 border-green-200',
    teal: 'bg-teal-100 text-teal-800 border-teal-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    cyan: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  };

  const renderTvBadges = (item: MenuItemData) => {
    const tags = item.dish?.tags ?? [];
    const certs = item.dish?.certifications ?? [];
    if (tags.length === 0 && certs.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {tags.map((tag) => {
          const cls = tvColorClasses[tag.color] || 'bg-gray-100 text-gray-800 border-gray-200';
          return (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm ${cls}`}
            >
              <Icon name={tag.icon as IconName} className="h-5 w-5 shrink-0" />
              <span className="whitespace-nowrap text-lg font-semibold">{tag.label}</span>
            </span>
          );
        })}
        {certs.map((cert) => (
          <span
            key={cert.id}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm"
          >
            <img
              src={`/certifications/${cert.logo_filename}`}
              alt={cert.name}
              className="h-6 w-6 shrink-0 object-contain"
            />
            <span className="whitespace-nowrap text-lg font-semibold text-gray-700">
              {cert.name}
            </span>
          </span>
        ))}
      </div>
    );
  };

  if (isError && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <InlineError type={getErrorType(error)} onRetry={() => refetch()} showLogo={true} />
      </div>
    );
  }

  return (
    <div className="tv-mode relative flex min-h-screen flex-col overflow-hidden bg-gray-50 transition-all duration-500">
      {/* Contrôles Zoom + Rotation */}
      <div
        className={`fixed bottom-6 right-6 z-50 flex flex-col gap-4 transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0'}`}
      >
        <button
          onClick={() => setZoomLevel((prev) => Math.min(prev + 0.1, 2.5))}
          className="rounded-full bg-black/60 p-4 text-white shadow-xl backdrop-blur-md transition-all hover:scale-110 hover:bg-black/80"
          title="Zoomer (+)"
        >
          <ZoomIn className="h-8 w-8" />
        </button>
        <button
          onClick={() => setZoomLevel((prev) => Math.max(prev - 0.1, 0.5))}
          className="rounded-full bg-black/60 p-4 text-white shadow-xl backdrop-blur-md transition-all hover:scale-110 hover:bg-black/80"
          title="Dézoomer (-)"
        >
          <ZoomOut className="h-8 w-8" />
        </button>
        <button
          onClick={() => setIsRotated(!isRotated)}
          className={`rounded-full p-4 shadow-xl backdrop-blur-md transition-all duration-300 hover:scale-110 ${isRotated ? 'bg-mariam-blue/80 text-white hover:bg-mariam-blue' : 'bg-black/60 text-white hover:bg-black/80'}`}
          title={isRotated ? "Rétablir l'affichage horizontal" : "Pivoter l'écran"}
        >
          <RefreshCw
            className={`h-8 w-8 transition-transform duration-500 ${isRotated ? 'rotate-90' : ''}`}
          />
        </button>
      </div>

      {/* Contenu avec Zoom */}
      <div
        style={{ zoom: zoomLevel } as React.CSSProperties}
        className="flex h-full w-full flex-col"
      >
        {/* Header TV */}
        <header className="flex shrink-0 items-center justify-between border-b bg-white px-10 py-8 shadow-sm">
          <div className="flex items-center gap-8">
            {todayData?.restaurant?.logo_url && (
              <img
                src={todayData.restaurant.logo_url}
                alt=""
                className="h-24 w-auto object-contain"
              />
            )}
            <div>
              <h1 className="text-5xl font-bold leading-none tracking-tight text-mariam-blue">
                Menu du jour
              </h1>
              <p className="mt-2 text-3xl font-light text-gray-500">
                {todayData?.day_name}{' '}
                {todayData?.date &&
                  new Date(todayData.date + 'T12:00:00').toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                  })}
              </p>
            </div>
          </div>
          {todayData?.restaurant && (
            <div className="text-right">
              <p className="text-4xl font-light text-gray-600">{todayData.restaurant.name}</p>
            </div>
          )}
        </header>

        {/* Bannière événement du jour */}
        {!activeClosure && todayEvent && <TvTodayEventBanner event={todayEvent} />}

        {/* Contenu principal */}
        <main className="flex-1 overflow-hidden bg-gray-50/50 p-10">
          {isPending ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-32 w-32 animate-spin rounded-full border-b-8 border-mariam-blue" />
            </div>
          ) : activeClosure ? (
            <TvClosureDisplay closure={activeClosure} />
          ) : todayData?.menu ? (
            <div className="custom-scrollbar h-full overflow-y-auto pr-6">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(460px,1fr))] content-start gap-8 pb-20">
                {(() => {
                  const subs = todayData.menu.substitutions;
                  const cards: React.ReactNode[] = [];
                  let colorIndex = 0;
                  for (const category of todayData.menu.by_category || []) {
                    const leaves =
                      category.subcategories && category.subcategories.length > 0
                        ? category.subcategories
                        : [category];
                    for (const leaf of leaves) {
                      const items = leaf.items || [];
                      if (items.length === 0) continue;
                      cards.push(
                        <TvCategoryCard
                          key={leaf.id}
                          category={leaf}
                          items={items}
                          color={getCategoryColor(leaf.color_key, colorIndex++)}
                          renderBadges={renderTvBadges}
                          substitutions={subs?.[leaf.id]}
                        />
                      );
                    }
                  }
                  return cards;
                })()}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              <p className="text-5xl font-light">Aucun menu disponible pour aujourd'hui</p>
            </div>
          )}
        </main>
      </div>

      {/* Footer rotatif */}
      {footerCount > 0 && (
        <footer className="fixed bottom-0 left-0 z-40 w-full overflow-hidden shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
          <div
            className="flex transition-transform duration-700 ease-in-out"
            style={{
              width: `${footerCount * 100}%`,
              transform: `translateX(-${footerSlot * (100 / footerCount)}%)`,
            }}
          >
            {footerSlots.map((slot, i) => (
              <div key={slot + i} style={{ width: `${100 / footerCount}%` }} className="shrink-0">
                {slot === 'event' && <TvUpcomingEventFooter event={upcomingEvents[0]} />}
                {slot === 'tomorrow' && tomorrowData?.menu && (
                  <TvTomorrowFooter menu={tomorrowData.menu} />
                )}
                {slot === 'chefnote' && todayData?.menu?.chef_note && (
                  <TvChefNoteFooter note={todayData.menu.chef_note} />
                )}
              </div>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
