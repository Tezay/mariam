import { useEffect, type CSSProperties } from 'react';
import { CalendarOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { CapacityDial } from '@/components/CapacityDial';
import { TagIcon } from '@/components/TagIcon';
import type { Closure } from '@/lib/api/closures';
import type { News } from '@/lib/api/news';
import type { LiveStatus, PublicOrg } from '@/lib/api/sites';
import { capacityState, capacityText, type CapacityState } from '@/lib/capacity-state';
import { getCategoryColor } from '@/lib/category-colors';
import { formatParisTime, parisToday } from '@/lib/date-utils';
import { getServiceStatus } from '@/lib/service-utils';
import { trackPageView } from '@/lib/telemetry';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { newsLabel } from '../menu/news-label';
import type { PublicMenuData, RestaurantPublic } from '../menu-types';
import { siteStatus, type SiteStatus } from '../site/site-status';
import { useLiveStatus } from '../site/use-live-status';
import { usePublicMenu } from '../use-public-menu';
import {
  menuDensity,
  reopeningDay,
  screenQrUrl,
  tvCategories,
  type TvCategory,
  type TvDish,
} from './tv-layout';
import { useFitDensity, useSignage } from './use-signage';

const STALE_MS = 15 * 60_000;
const TOMORROW_DISHES = 4;

const u = (px: number) => `calc(var(--u) * ${px})`;
const level = (name: string) => `calc(var(--u) * var(--${name}))`;

const TONES: Record<SiteStatus['tone'], string> = {
  ok: 'border-site-ok/30 bg-site-ok-soft text-site-ok',
  soon: 'border-site-note-line bg-site-note text-site-soon',
  subtle: 'border-site-line bg-site-raised text-site-subtle',
  danger: 'border-site-danger-line bg-site-danger-soft text-site-danger',
};

function dayOf(date: string, weekday = true): string {
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    weekday: weekday ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Kicker({ children }: { children: string }) {
  return (
    <span
      className="font-bold uppercase text-site-subtle"
      style={{ fontSize: u(17), letterSpacing: '0.08em' }}
    >
      {children}
    </span>
  );
}

function TvHeader({
  organization,
  site,
  status,
  now,
  updatedAt,
}: {
  organization: PublicOrg;
  site: RestaurantPublic;
  status: SiteStatus | null;
  now: Date;
  updatedAt: number;
}) {
  const stale = now.getTime() - updatedAt > STALE_MS;
  return (
    <header
      className="flex shrink-0 items-center border-b border-site-line bg-site-surface"
      style={{ gap: u(28), padding: `${u(24)} ${u(48)}`, minHeight: u(128) }}
    >
      {site.logo_url && (
        <img
          src={site.logo_url}
          alt=""
          className="shrink-0 object-contain"
          style={{ height: u(80), maxWidth: u(160) }}
        />
      )}
      <div
        className="flex min-w-0 flex-1 flex-wrap items-center"
        style={{ gap: `${u(8)} ${u(28)}` }}
      >
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-site-subtle" style={{ fontSize: u(20) }}>
            {organization.name}
          </span>
          <span
            className="font-extrabold leading-tight"
            style={{ fontSize: u(44), letterSpacing: '-0.02em' }}
          >
            {site.name}
          </span>
        </div>
        {status && (
          <span
            className={cn('flex items-center rounded-full border-2 font-bold', TONES[status.tone])}
            style={{ gap: u(12), fontSize: u(24), padding: `${u(10)} ${u(22)}` }}
          >
            <span
              aria-hidden
              className="rounded-full bg-current"
              style={{ width: u(14), height: u(14) }}
            />
            {status.label}
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="font-bold tabular-nums leading-none" style={{ fontSize: u(56) }}>
          {formatParisTime(now)}
        </span>
        <span className="font-medium text-site-subtle" style={{ fontSize: u(22), marginTop: u(6) }}>
          {dayOf(parisToday(now))}
        </span>
        {stale && (
          <span
            className="font-semibold text-site-danger"
            style={{ fontSize: u(18), marginTop: u(4) }}
          >
            {`Hors ligne · à jour à ${formatParisTime(new Date(updatedAt)).replace(':', 'h')}`}
          </span>
        )}
      </div>
    </header>
  );
}

function TvDishRow({ entry }: { entry: TvDish }) {
  const tags = entry.dish.tags ?? [];
  const certifications = entry.dish.certifications ?? [];
  const icon = { width: level('dish'), height: level('dish') };
  return (
    <div
      className="flex items-center justify-between border-t border-site-line/60"
      style={{ gap: u(12), paddingTop: level('row') }}
    >
      <span
        className={cn(
          'min-w-0 font-semibold leading-tight',
          entry.out && 'text-site-subtle line-through'
        )}
        style={{ fontSize: level('dish') }}
      >
        {entry.substitute && (
          <span
            className="rounded-full bg-[#F5A524] align-middle font-extrabold uppercase text-[#4A2E00]"
            style={{ fontSize: level('tag'), padding: `${u(3)} ${u(10)}`, marginRight: u(10) }}
          >
            Nouveau
          </span>
        )}
        {entry.dish.name}
      </span>
      {entry.out ? (
        <span className="shrink-0 font-semibold text-site-soon" style={{ fontSize: level('tag') }}>
          Rupture
        </span>
      ) : (
        tags.length + certifications.length > 0 && (
          <span
            className="tv-tags flex max-w-[45%] shrink-0 flex-wrap items-center justify-end text-site-subtle"
            style={{ gap: u(10) }}
          >
            {tags.map((tag) => (
              <span key={tag.id} role="img" aria-label={tag.label} title={tag.label}>
                <TagIcon name={tag.icon} aria-hidden style={icon} />
              </span>
            ))}
            {certifications.map((certification) => (
              <img
                key={certification.id}
                src={`/certifications/${certification.logo_filename}`}
                alt={certification.name}
                title={certification.name}
                className="object-contain"
                style={icon}
              />
            ))}
          </span>
        )
      )}
    </div>
  );
}

function TvCategoryCard({ category }: { category: TvCategory }) {
  const color = getCategoryColor(category.colorKey, category.order);
  return (
    <div
      className="flex flex-col overflow-hidden border border-site-line bg-site-surface"
      style={{ borderRadius: u(24) }}
    >
      <div style={{ height: u(8), background: color.bg }} />
      <div
        className="flex flex-col"
        style={{ padding: `${level('pad')} ${u(26)}`, gap: level('row') }}
      >
        <h2
          className="m-0 font-extrabold uppercase"
          style={{ fontSize: level('cat'), letterSpacing: '0.06em', color: color.sectionLabel }}
        >
          {category.label}
        </h2>
        {category.dishes.map((entry) => (
          <TvDishRow key={entry.key} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function TvMenu({
  categories,
  note,
  portrait,
}: {
  categories: TvCategory[];
  note: string | null | undefined;
  portrait: boolean;
}) {
  const { ref, density } = useFitDensity(menuDensity(categories, portrait), categories);
  return (
    <section className="tv-main flex min-h-0 flex-col" style={{ gap: u(20) }}>
      <h1 className="m-0 font-extrabold" style={{ fontSize: u(38), letterSpacing: '-0.01em' }}>
        Menu du jour
      </h1>
      {categories.length > 0 ? (
        <div ref={ref} data-density={density} className="tv-menu min-h-0 flex-1 overflow-hidden">
          {categories.map((category) => (
            <TvCategoryCard key={category.id} category={category} />
          ))}
        </div>
      ) : (
        <p className="m-0 flex-1 text-site-subtle" style={{ fontSize: u(30) }}>
          Le menu du jour n'est pas encore publié.
        </p>
      )}
      {note && (
        <p
          className="m-0 flex items-baseline border border-site-note-line bg-site-note text-site-note-text"
          style={{ gap: u(14), fontSize: u(22), borderRadius: u(20), padding: `${u(18)} ${u(26)}` }}
        >
          <strong className="shrink-0 font-extrabold">Le mot du chef</strong>
          <span className="min-w-0">{note}</span>
        </p>
      )}
    </section>
  );
}

function TvClosure({ closure, serviceDays }: { closure: Closure; serviceDays: number[] }) {
  const reopening = reopeningDay(closure.end_date, serviceDays);
  return (
    <section
      className="tv-main flex flex-col items-center justify-center border border-site-line bg-site-surface text-center"
      style={{ gap: u(20), borderRadius: u(28), padding: u(48) }}
    >
      <CalendarOff
        aria-hidden
        className="text-site-subtle"
        strokeWidth={1.6}
        style={{ width: u(120), height: u(120) }}
      />
      <h1 className="m-0 font-extrabold" style={{ fontSize: u(72), letterSpacing: '-0.02em' }}>
        Fermé aujourd'hui
      </h1>
      {closure.reason && (
        <p className="m-0 text-site-subtle" style={{ fontSize: u(34) }}>
          {closure.reason}
        </p>
      )}
      {reopening && (
        <p className="m-0 font-bold text-site-brand" style={{ fontSize: u(32) }}>
          {`Réouverture ${dayOf(reopening).toLowerCase()}`}
        </p>
      )}
    </section>
  );
}

function TvCapacity({
  capacity,
  state,
  reachedAt,
}: {
  capacity: number;
  state: CapacityState;
  reachedAt: string | null;
}) {
  const { title, lead, tail } = capacityText(capacity, state, reachedAt);
  const tone = { available: 'text-site-ok', reached: 'text-site-danger', idle: 'text-site-subtle' }[
    state
  ];
  return (
    <section
      aria-label="Capacité maximale"
      className={cn(
        'tv-cap flex items-center border',
        state === 'reached'
          ? 'border-site-danger-line bg-site-danger-soft'
          : 'border-site-line bg-site-surface'
      )}
      style={{ gap: u(24), borderRadius: u(24), padding: `${u(22)} ${u(28)}` }}
    >
      <CapacityDial
        state={state}
        className={cn('h-[calc(var(--u)*96)] w-[calc(var(--u)*157)]', tone)}
      />
      <div className="flex min-w-0 flex-col" style={{ gap: u(6) }}>
        <span
          aria-live="polite"
          className={cn('font-extrabold leading-tight', state !== 'idle' && tone)}
          style={{ fontSize: u(32) }}
        >
          {title}
        </span>
        <span className="text-site-subtle" style={{ fontSize: u(21) }}>
          {[lead, tail].filter(Boolean).join(' · ')}
        </span>
      </div>
    </section>
  );
}

function TvToday({ item }: { item: News }) {
  const photo = item.images[0]?.url;
  return (
    <section
      className="tv-today flex overflow-hidden border border-site-line bg-site-surface"
      style={{ borderRadius: u(24) }}
    >
      {photo && (
        <img src={photo} alt="" className="shrink-0 object-cover" style={{ width: u(168) }} />
      )}
      <div className="flex min-w-0 flex-col" style={{ gap: u(8), padding: `${u(22)} ${u(24)}` }}>
        <span
          className="self-start rounded-full bg-[#F5A524] font-extrabold text-[#4A2E00]"
          style={{ fontSize: u(18), padding: `${u(4)} ${u(14)}` }}
        >
          Aujourd'hui
        </span>
        <span className="font-extrabold leading-tight" style={{ fontSize: u(30) }}>
          {item.title}
        </span>
        {item.summary && (
          <span className="text-site-subtle" style={{ fontSize: u(20), lineHeight: 1.35 }}>
            {item.summary}
          </span>
        )}
      </div>
    </section>
  );
}

function TvUpcoming({
  next,
  tomorrow,
  today,
}: {
  next: News | null;
  tomorrow: string[];
  today: string;
}) {
  return (
    <section
      className="tv-upcoming border border-site-line bg-site-surface"
      style={{ borderRadius: u(24), padding: `${u(22)} ${u(28)}` }}
    >
      <div className="tv-next flex flex-col" style={{ gap: u(14) }}>
        {next && (
          <div className="flex min-w-0 flex-1 flex-col" style={{ gap: u(4) }}>
            <Kicker>À venir</Kicker>
            <span className="font-semibold text-site-brand" style={{ fontSize: u(21) }}>
              {newsLabel(next, today)}
            </span>
            <span className="font-extrabold leading-tight" style={{ fontSize: u(27) }}>
              {next.title}
            </span>
          </div>
        )}
        {tomorrow.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-col" style={{ gap: u(4) }}>
            <Kicker>Demain</Kicker>
            <span className="font-semibold" style={{ fontSize: u(23), lineHeight: 1.35 }}>
              {tomorrow.join(' · ')}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function TvQr({ url }: { url: string }) {
  return (
    <section
      className="tv-qr flex items-center border border-site-line bg-site-surface"
      style={{ gap: u(22), borderRadius: u(24), padding: `${u(20)} ${u(24)}` }}
    >
      <QRCodeSVG
        value={url}
        size={264}
        level="M"
        marginSize={0}
        title="QR code vers la page du restaurant"
        style={{ width: u(132), height: u(132), flexShrink: 0 }}
      />
      <div className="flex min-w-0 flex-col" style={{ gap: u(6) }}>
        <span className="font-extrabold leading-tight" style={{ fontSize: u(26) }}>
          Le menu sur votre téléphone
        </span>
        <span className="text-site-subtle" style={{ fontSize: u(19), lineHeight: 1.35 }}>
          Scannez pour voter et recevoir le menu chaque jour.
        </span>
      </div>
    </section>
  );
}

export function TvScreen({
  organization,
  siteSlug,
  initial,
  initialLive,
  serverNow,
  pageUrl,
  rotation,
}: {
  organization: PublicOrg;
  siteSlug: string;
  initial: PublicMenuData;
  initialLive: LiveStatus | null;
  serverNow: number;
  pageUrl: string;
  rotation: 0 | 90 | 270;
}) {
  useSignage();
  useEffect(() => {
    trackPageView('tv', organization.slug, siteSlug);
  }, [organization.slug, siteSlug]);

  const now = useNow(serverNow, 15_000);
  const query = usePublicMenu(organization.slug, siteSlug, 'tv', {
    initial: { data: initial, fetchedAt: serverNow },
  });
  const menu = query.data ?? initial;
  const site = menu.restaurant;
  const closure = menu.activeClosure;
  const inService = !closure && getServiceStatus(site.service_hours, site.service_days, now).isOpen;
  const live = useLiveStatus(organization.slug, siteSlug, {
    initial: initialLive,
    fetchedAt: serverNow,
    inService,
  });
  const reached = live ? live.capacity_reached : null;

  const today = parisToday(now);
  const categories = menu.today?.menu ? tvCategories(menu.today.menu) : [];
  const capacity = closure ? null : site.service_capacity;
  const todayItem = closure ? null : menu.todayEvent;
  const next = menu.upcomingEvents[0] ?? null;
  const tomorrow =
    !closure && menu.tomorrow?.menu
      ? tvCategories(menu.tomorrow.menu)
          .filter((category) => category.highlighted)
          .flatMap((category) => category.dishes.filter((entry) => !entry.substitute))
          .map((entry) => entry.dish.name)
          .slice(0, TOMORROW_DISHES)
      : [];
  const upcoming = next !== null || tomorrow.length > 0;

  const areas: [string, string][] = [
    [capacity != null ? '"cap qr"' : '"qr qr"', 'auto'],
    ...(todayItem ? ([['"today today"', 'auto']] as [string, string][]) : []),
    ['"menu menu"', 'minmax(0, 1fr)'],
    ...(upcoming ? ([['"next next"', 'auto']] as [string, string][]) : []),
  ];
  const bodyStyle = {
    '--tv-areas': areas.map(([area]) => area).join(' '),
    '--tv-rows': areas.map(([, row]) => row).join(' '),
  } as CSSProperties;

  return (
    <div
      className="tv-screen public-page bg-site-page text-site-text"
      data-rotation={rotation ? String(rotation) : undefined}
    >
      <TvHeader
        organization={organization}
        site={site}
        status={siteStatus(site, closure, now, reached === true)}
        now={now}
        updatedAt={query.dataUpdatedAt || serverNow}
      />
      <div className="tv-body" style={bodyStyle}>
        {closure ? (
          <TvClosure closure={closure} serviceDays={site.service_days} />
        ) : (
          <TvMenu
            categories={categories}
            note={menu.today?.menu?.chef_note}
            portrait={rotation !== 0}
          />
        )}
        <div className="tv-side">
          {capacity != null && (
            <TvCapacity
              capacity={capacity}
              state={capacityState(reached, inService)}
              reachedAt={live?.reached_at ?? null}
            />
          )}
          {todayItem && <TvToday item={todayItem} />}
          {upcoming && <TvUpcoming next={next} tomorrow={tomorrow} today={today} />}
          <TvQr url={screenQrUrl(pageUrl)} />
        </div>
      </div>
    </div>
  );
}
