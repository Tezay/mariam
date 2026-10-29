import { Link } from 'react-router';
import { Bell, ChevronRight, MapPin } from 'lucide-react';
import type { Closure } from '@/lib/api/closures';
import type { PublicOrg } from '@/lib/api/sites';
import { getServiceStatus } from '@/lib/service-utils';
import { cn } from '@/lib/utils';
import type { RestaurantPublic } from '../menu-types';
import { addressLines } from './address';

const TONES = {
  ok: { text: 'text-site-ok', dot: 'bg-site-ok', pill: 'bg-site-ok-soft' },
  soon: { text: 'text-site-soon', dot: 'bg-site-soon', pill: 'bg-site-note' },
  subtle: { text: 'text-site-subtle', dot: 'bg-site-subtle', pill: 'bg-site-raised' },
  danger: { text: 'text-site-danger', dot: 'bg-site-danger', pill: 'bg-site-danger-soft' },
};
const STATUS_TONES = { green: TONES.ok, amber: TONES.soon, gray: TONES.subtle };

function siteStatus(site: RestaurantPublic, closure: Closure | null, now: Date) {
  if (closure) {
    return { label: `Fermé · ${closure.reason ?? 'fermeture exceptionnelle'}`, tone: TONES.danger };
  }
  if (site.service_days.length === 0) return null;
  const status = getServiceStatus(site.service_hours, site.service_days, now);
  return { label: status.label, tone: STATUS_TONES[status.color] };
}

export function NotificationsButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-11 items-center justify-center gap-2 rounded-xl bg-site-brand-soft px-4 text-sm font-bold text-site-brand transition-opacity hover:opacity-90',
        className
      )}
    >
      <Bell aria-hidden className="h-4 w-4" />
      Recevoir le menu chaque jour
    </button>
  );
}

interface SiteHeaderProps {
  organization: PublicOrg;
  multiSite: boolean;
  site: RestaurantPublic;
  closure: Closure | null;
  now: Date;
  onOpenNotifications: () => void;
}

export function SiteHeader({
  organization,
  multiSite,
  site,
  closure,
  now,
  onOpenNotifications,
}: SiteHeaderProps) {
  const status = siteStatus(site, closure, now);
  const address = addressLines(site);
  const orgName = multiSite ? (
    <Link to="/" className="hover:text-site-text">
      {organization.name}
    </Link>
  ) : (
    organization.name
  );

  return (
    <header className="border-b border-site-line bg-site-surface">
      <div className="mx-auto max-w-[1200px] lg:px-6">
        <nav
          aria-label="Fil d'Ariane"
          className="hidden flex-wrap items-center justify-between gap-3 py-3 lg:flex"
        >
          <p className="flex items-center gap-2 text-sm text-site-subtle">
            <span className="py-2.5 font-semibold">{orgName}</span>
            {multiSite && (
              <>
                <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                <span className="font-semibold text-site-text">{site.name}</span>
              </>
            )}
          </p>
          <NotificationsButton onClick={onOpenNotifications} />
        </nav>

        <div className="flex items-center gap-3 py-3 pl-4 pr-2 lg:gap-8 lg:px-0 lg:pb-9 lg:pt-5">
          <div className="flex min-w-0 flex-1 flex-col lg:gap-4">
            <div className="flex min-w-0 items-center gap-3 lg:gap-4">
              {site.logo_url && (
                <img
                  src={site.logo_url}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-xl border border-site-line bg-white object-contain p-1 lg:h-[72px] lg:w-[72px] lg:rounded-[18px] lg:p-1.5"
                />
              )}
              <div className="flex min-w-0 flex-col gap-px">
                <h1 className="truncate text-[17px] font-bold leading-tight text-site-brand lg:whitespace-normal lg:text-[2.5rem] lg:leading-[1.1] lg:tracking-tight">
                  {site.name}
                </h1>
                <p className="order-first text-[11px] font-semibold text-site-subtle lg:order-none lg:mt-1.5 lg:text-[15px] lg:font-normal">
                  {orgName}
                </p>
                {status && (
                  <p
                    className={cn(
                      'flex items-center gap-1.5 text-[13px] font-semibold lg:hidden',
                      status.tone.text
                    )}
                  >
                    <span aria-hidden className={cn('h-2 w-2 rounded-full', status.tone.dot)} />
                    {status.label}
                  </p>
                )}
                {address && (
                  <p className="truncate text-xs text-site-subtle lg:hidden">
                    {address.street}
                    {site.address_city && `, ${site.address_city}`}
                  </p>
                )}
              </div>
            </div>

            {site.tagline && (
              <p className="hidden max-w-[34rem] text-lg font-medium lg:block">{site.tagline}</p>
            )}

            {(status || address) && (
              <div className="hidden flex-wrap items-center gap-3 lg:flex">
                {status && (
                  <span
                    className={cn(
                      'flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold',
                      status.tone.text,
                      status.tone.pill
                    )}
                  >
                    <span aria-hidden className={cn('h-2 w-2 rounded-full', status.tone.dot)} />
                    {status.label}
                  </span>
                )}
                {address && (
                  <span className="flex items-center gap-1.5 text-sm text-site-subtle">
                    <MapPin aria-hidden className="h-4 w-4" />
                    {[address.street, address.locality].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {site.cover_url && (
            <img
              src={site.cover_url}
              alt=""
              className="hidden h-[280px] min-w-0 flex-1 rounded-3xl object-cover lg:block"
            />
          )}

          <button
            type="button"
            onClick={onOpenNotifications}
            aria-label="Recevoir les notifications"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-site-subtle transition-colors hover:bg-site-raised lg:hidden"
          >
            <Bell aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
