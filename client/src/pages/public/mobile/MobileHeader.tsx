import { useState } from 'react';
import { ChevronDown, ChevronUp, Phone, Mail, Users, Accessibility, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getServiceStatus, groupConsecutiveHours } from '@/lib/service-utils';
import type { RestaurantPublic } from '../menu-types';
import type { ExceptionalClosure } from '@/lib/api';

const PAYMENT_CONFIG: Record<string, { src: string; label: string }> = {
  izly: { src: '/payments/izly.svg', label: 'Izly' },
  cb: { src: '/payments/cb.svg', label: 'Carte bancaire' },
  cash: { src: '/payments/cash.svg', label: 'Espèces' },
  ticket_restaurant: { src: '/payments/ticket_restaurant.svg', label: 'Ticket Restaurant' },
};

function ServiceStatusDot({ color }: { color: 'green' | 'amber' | 'gray' | 'red' }) {
  const cls = {
    green: 'bg-green-500',
    amber: 'bg-amber-400',
    gray: 'bg-gray-400',
    red: 'bg-red-500',
  }[color];
  return <span className={`inline-block h-2 w-2 rounded-full ${cls} shrink-0`} />;
}

interface MobileHeaderProps {
  restaurant: RestaurantPublic;
  activeClosure?: ExceptionalClosure | null;
}

export function MobileHeader({ restaurant, activeClosure }: MobileHeaderProps) {
  const [expanded, setExpanded] = useState(false);

  const navigate = useNavigate();

  const serviceDays = restaurant.config?.service_days ?? [];
  const serviceHours = restaurant.service_hours ?? {};
  const normalStatus = getServiceStatus(serviceHours, serviceDays);
  const status = activeClosure
    ? {
        label: `Fermé — ${activeClosure.reason ?? 'Fermeture exceptionnelle'}`,
        isOpen: false,
        color: 'red' as const,
      }
    : normalStatus;
  const paymentMethods = restaurant.payment_methods ?? [];
  const groupedHours = groupConsecutiveHours(serviceHours, serviceDays);

  return (
    <header className="shrink-0 bg-white" style={{ boxShadow: '0 1px 0 0 #f0f0f0' }}>
      <div className="h-1 w-full bg-mariam-blue" />

      {/* Ligne principale */}
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {/* Logo Mariam (mini) */}
        <img src="/favicon.svg" alt="Mariam" className="h-8 w-8 shrink-0 object-contain" />

        {/* Logo restaurant */}
        {restaurant.logo_url && (
          <img
            src={restaurant.logo_url}
            alt={restaurant.name}
            className="h-10 w-10 shrink-0 rounded-lg object-contain"
          />
        )}

        {/* Infos restaurant */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold leading-tight text-mariam-blue">
            {restaurant.name}
          </p>
          {restaurant.address_label && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{restaurant.address_label}</p>
          )}
          {serviceDays.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5">
              <ServiceStatusDot color={status.color} />
              <span
                className={`text-xs font-medium ${status.isOpen ? 'text-green-600' : status.color === 'amber' ? 'text-amber-600' : status.color === 'red' ? 'font-semibold text-red-600' : 'text-gray-400'}`}
              >
                {status.label}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate('/notifications');
          }}
          className="shrink-0 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          className="shrink-0 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100"
          aria-label={expanded ? 'Réduire' : "Plus d'informations"}
        >
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>
      </div>

      {/* Panel déroulable */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: expanded ? '600px' : '0px' }}
      >
        <div className="space-y-4 border-t border-gray-100 bg-gray-50 px-4 py-4">
          {/* Paiements + couverts + PMR — chips */}
          {(paymentMethods.length > 0 || restaurant.pmr_access === true || restaurant.capacity) && (
            <div className="flex flex-wrap gap-2">
              {paymentMethods.map((method) => {
                const config = PAYMENT_CONFIG[method];
                if (!config) return null;
                return (
                  <div
                    key={method}
                    className="rounded-xl border border-gray-100 bg-white p-2 shadow-sm"
                  >
                    <img src={config.src} alt={config.label} className="h-6 w-6 object-contain" />
                  </div>
                );
              })}

              {restaurant.capacity && (
                <div className="flex items-center gap-1.5 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm">
                  <Users className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="text-sm text-gray-700">{restaurant.capacity} couverts</span>
                </div>
              )}

              {restaurant.pmr_access === true && (
                <div className="flex items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 shadow-sm">
                  <Accessibility className="h-4 w-4 shrink-0 text-blue-500" />
                  <span className="text-sm font-medium text-blue-600">Accessible</span>
                </div>
              )}
            </div>
          )}

          {/* Horaires groupés */}
          {groupedHours.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Horaires
              </p>
              <div className="flex flex-col gap-1">
                {groupedHours.map(({ days, hours }) => (
                  <div key={days} className="flex justify-between text-sm">
                    <span className="font-medium text-gray-500">{days}</span>
                    <span className="text-gray-700">{hours}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact + Notifications — côte à côte si contact défini */}
          <div className="flex items-stretch gap-3">
            {(restaurant.phone || restaurant.email) && (
              <div className="flex min-w-0 flex-1 flex-col justify-center space-y-1">
                {restaurant.phone && (
                  <a
                    href={`tel:${restaurant.phone}`}
                    className="flex items-center gap-2 text-sm text-gray-600"
                  >
                    <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                    {restaurant.phone}
                  </a>
                )}
                {restaurant.email && (
                  <a
                    href={`mailto:${restaurant.email}`}
                    className="flex min-w-0 items-center gap-2 text-sm text-gray-600"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="truncate">{restaurant.email}</span>
                  </a>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className={`flex items-center justify-center gap-2 rounded-xl bg-mariam-blue/10 px-4 py-2.5 text-sm font-semibold text-mariam-blue ${!(restaurant.phone || restaurant.email) ? 'w-full' : 'shrink-0'}`}
            >
              <Bell className="h-4 w-4 shrink-0" />
              Notifications
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
