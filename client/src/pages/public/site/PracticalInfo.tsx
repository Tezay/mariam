import type { ReactNode } from 'react';
import { Accessibility, Clock, ExternalLink, Mail, Phone } from 'lucide-react';
import { SiteLinkIcon } from '@/components/SiteLinkIcon';
import type { MapTiles } from '@/lib/runtime-config';
import { groupConsecutiveHours } from '@/lib/service-utils';
import { linkKind, PAYMENT_OPTIONS, SERVICES } from '@/lib/site-profile';
import type { RestaurantPublic } from '../menu-types';
import { MapCard } from './MapCard';

const CARD = 'rounded-[20px] border border-site-line bg-site-surface p-4 lg:p-5';
const CHIP =
  'flex items-center gap-1.5 rounded-xl bg-site-raised px-3 py-1.5 text-[13px] font-semibold lg:text-sm';
const KICKER = 'text-xs font-semibold uppercase tracking-[0.08em] text-site-subtle';
const ROW =
  'flex min-h-12 items-center gap-3 border-b border-site-line font-semibold last:border-b-0';

function HoursCard({ site }: { site: RestaurantPublic }) {
  const hours = groupConsecutiveHours(site.service_hours, site.service_days);
  if (hours.length === 0) return null;
  return (
    <div className={`${CARD} flex flex-col gap-2.5`}>
      <h3 className="flex items-center gap-2 text-[15px] font-bold lg:text-base">
        <Clock aria-hidden className="h-[18px] w-[18px] text-site-brand" />
        Horaires
      </h3>
      {hours.map(({ days, hours: range }) => (
        <p key={days} className="flex justify-between">
          <span className="font-medium text-site-subtle">{days}</span>
          <span className="font-semibold">{range}</span>
        </p>
      ))}
    </div>
  );
}

function AmenitiesCard({ site }: { site: RestaurantPublic }) {
  const payments = PAYMENT_OPTIONS.filter((option) => site.payment_methods?.includes(option.id));
  const services = SERVICES.filter((service) => site.services.includes(service.id));
  const welcome = site.pmr_access === true;
  if (payments.length === 0 && services.length === 0 && !welcome) return null;

  return (
    <div className={`${CARD} flex flex-col gap-3.5 lg:gap-4`}>
      {payments.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className={KICKER}>Paiement</h3>
          <ul className="flex flex-wrap gap-2">
            {payments.map((payment) => (
              <li key={payment.id} className={CHIP}>
                {payment.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {services.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className={KICKER}>Services sur place</h3>
          <ul className="flex flex-wrap gap-2">
            {services.map(({ id, label, icon: Icon }) => (
              <li key={id} className={CHIP}>
                <Icon aria-hidden className="h-3.5 w-3.5" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {welcome && (
        <div className="flex flex-col gap-2">
          <h3 className={KICKER}>Accueil</h3>
          {site.pmr_access === true && (
            <p className="flex items-center gap-2 lg:text-sm">
              <Accessibility aria-hidden className="h-4 w-4 shrink-0 text-site-brand" />
              Accessible aux personnes à mobilité réduite
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ContactCard({ site }: { site: RestaurantPublic }) {
  if (!site.phone && !site.email && site.links.length === 0) return null;
  return (
    <div className={`${CARD} flex flex-col py-1.5 lg:py-2`}>
      {site.phone && (
        <a href={`tel:${site.phone.replace(/\s/g, '')}`} className={ROW}>
          <Phone aria-hidden className="h-[18px] w-[18px] shrink-0 text-site-brand" />
          {site.phone}
        </a>
      )}
      {site.email && (
        <a href={`mailto:${site.email}`} className={ROW}>
          <Mail aria-hidden className="h-[18px] w-[18px] shrink-0 text-site-brand" />
          <span className="truncate">{site.email}</span>
        </a>
      )}
      {site.links.map((link) => (
        <a
          key={`${link.kind}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={ROW}
        >
          <SiteLinkIcon kind={link.kind} className="h-[18px] w-[18px] text-site-brand" />
          <span className="min-w-0 flex-1 truncate">{link.label ?? linkKind(link.kind).label}</span>
          <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-site-subtle" />
        </a>
      ))}
    </div>
  );
}

export function PracticalInfo({
  site,
  mapTiles,
  children,
}: {
  site: RestaurantPublic;
  mapTiles: MapTiles | null;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="practical-title" className="flex flex-col gap-3 lg:gap-4">
      <h2 id="practical-title" className="text-lg font-bold lg:sr-only">
        Infos pratiques
      </h2>
      {children}
      <HoursCard site={site} />
      <MapCard site={site} tiles={mapTiles} />
      <AmenitiesCard site={site} />
      <ContactCard site={site} />
    </section>
  );
}
