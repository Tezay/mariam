import { useState } from 'react';
import { ChevronDown, ChevronUp, Phone, Mail, Users, Accessibility, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getServiceStatus, groupConsecutiveHours } from '@/lib/service-utils';
import type { RestaurantPublic } from '../menu-types';

const PAYMENT_CONFIG: Record<string, { src: string; label: string }> = {
    izly:              { src: '/payments/izly.svg',              label: 'Izly' },
    cb:                { src: '/payments/cb.svg',                label: 'Carte bancaire' },
    cash:              { src: '/payments/cash.svg',              label: 'Espèces' },
    ticket_restaurant: { src: '/payments/ticket_restaurant.svg', label: 'Ticket Restaurant' },
};

function ServiceStatusDot({ color }: { color: 'green' | 'amber' | 'gray' }) {
    const cls = { green: 'bg-green-500', amber: 'bg-amber-400', gray: 'bg-gray-400' }[color];
    return <span className={`inline-block w-2 h-2 rounded-full ${cls} shrink-0`} />;
}

interface MobileHeaderProps {
    restaurant: RestaurantPublic;
}

export function MobileHeader({ restaurant }: MobileHeaderProps) {
    const [expanded, setExpanded] = useState(false);

    const navigate = useNavigate();

    const serviceDays = restaurant.config?.service_days ?? [];
    const serviceHours = restaurant.service_hours ?? {};
    const status = getServiceStatus(serviceHours, serviceDays);
    const paymentMethods = restaurant.payment_methods ?? [];
    const groupedHours = groupConsecutiveHours(serviceHours, serviceDays);


    return (
        <header className="bg-white shrink-0" style={{ boxShadow: '0 1px 0 0 #f0f0f0' }}>
            <div className="h-1 w-full bg-mariam-blue" />

            {/* Ligne principale — entièrement cliquable */}
            <div
                className="px-4 py-3 flex items-center gap-3 cursor-pointer"
                onClick={() => setExpanded(prev => !prev)}
            >
                {/* Logo Mariam (mini) */}
                <img src="/favicon.svg" alt="Mariam" className="h-8 w-8 object-contain shrink-0" />

                {/* Logo restaurant */}
                {restaurant.logo_url && (
                    <img src={restaurant.logo_url} alt={restaurant.name}
                        className="h-10 w-10 object-contain shrink-0 rounded-lg" />
                )}

                {/* Infos restaurant */}
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-mariam-blue text-base leading-tight truncate">
                        {restaurant.name}
                    </p>
                    {restaurant.address_label && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{restaurant.address_label}</p>
                    )}
                    {serviceDays.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-1">
                            <ServiceStatusDot color={status.color} />
                            <span className={`text-xs font-medium ${status.isOpen ? 'text-green-600' : status.color === 'amber' ? 'text-amber-600' : 'text-gray-400'}`}>
                                {status.label}
                            </span>
                        </div>
                    )}
                </div>

                <button
                    onClick={(e) => { e.stopPropagation(); navigate('/notifications'); }}
                    className="p-2 rounded-full text-gray-400 hover:bg-gray-100 transition-colors shrink-0"
                    aria-label="Notifications"
                >
                    <Bell className="w-5 h-5" />
                </button>

                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); }}
                    className="p-2 rounded-full text-gray-400 hover:bg-gray-100 transition-colors shrink-0"
                    aria-label={expanded ? 'Réduire' : "Plus d'informations"}
                >
                    {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
            </div>

            {/* Panel déroulable */}
            <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{ maxHeight: expanded ? '600px' : '0px' }}
            >
                <div className="bg-gray-50 border-t border-gray-100 px-4 py-4 space-y-4">

                    {/* Paiements + couverts + PMR — chips */}
                    {(paymentMethods.length > 0 || restaurant.pmr_access === true || restaurant.capacity) && (
                        <div className="flex flex-wrap gap-2">
                            {paymentMethods.map(method => {
                                const config = PAYMENT_CONFIG[method];
                                if (!config) return null;
                                return (
                                    <div key={method} className="bg-white rounded-xl p-2 border border-gray-100 shadow-sm">
                                        <img src={config.src} alt={config.label} className="w-6 h-6 object-contain" />
                                    </div>
                                );
                            })}

                            {restaurant.capacity && (
                                <div className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-2 border border-gray-100 shadow-sm">
                                    <Users className="w-4 h-4 text-gray-400 shrink-0" />
                                    <span className="text-sm text-gray-700">{restaurant.capacity} couverts</span>
                                </div>
                            )}

                            {restaurant.pmr_access === true && (
                                <div className="flex items-center gap-1.5 bg-blue-50 rounded-xl px-3 py-2 border border-blue-100 shadow-sm">
                                    <Accessibility className="w-4 h-4 text-blue-500 shrink-0" />
                                    <span className="text-sm text-blue-600 font-medium">Accessible</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Horaires groupés */}
                    {groupedHours.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                                Horaires
                            </p>
                            <div className="flex flex-col gap-1">
                                {groupedHours.map(({ days, hours }) => (
                                    <div key={days} className="flex justify-between text-sm">
                                        <span className="text-gray-500 font-medium">{days}</span>
                                        <span className="text-gray-700">{hours}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Contact + Notifications — côte à côte si contact défini */}
                    <div className="flex items-stretch gap-3">
                        {(restaurant.phone || restaurant.email) && (
                            <div className="flex-1 flex flex-col justify-center space-y-1 min-w-0">
                                {restaurant.phone && (
                                    <a href={`tel:${restaurant.phone}`} className="flex items-center gap-2 text-sm text-gray-600">
                                        <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                                        {restaurant.phone}
                                    </a>
                                )}
                                {restaurant.email && (
                                    <a href={`mailto:${restaurant.email}`} className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                                        <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                                        <span className="truncate">{restaurant.email}</span>
                                    </a>
                                )}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => navigate('/notifications')}
                            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-mariam-blue/10 text-mariam-blue font-semibold text-sm ${!(restaurant.phone || restaurant.email) ? 'w-full' : 'shrink-0'}`}
                        >
                            <Bell className="w-4 h-4 shrink-0" />
                            Notifications
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}
