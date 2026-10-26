/**
 * Each section the Save button writes is compared with a snapshot taken on load
 * and renewed section by section after a save, so a section that fails stays
 * modified.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { notify } from '@/lib/toast';
import { DEFAULT_PRESET_ID } from '@/features/rating/scale';
import { useSiteRef } from '@/contexts/SiteContext';
import {
  sitesApi,
  type CalendarSettings,
  type PaymentMethod,
  type ServiceHours,
  type Site,
} from '@/lib/api/sites';
import {
  validateSiteName,
  validateEmail,
  validatePhone,
  serializeRestaurantState,
  RestaurantFormState,
} from './settings-shared';

export type SaveOutcome = 'saved' | 'partial' | 'validation-error' | 'noop';

function formOf(site: Site): RestaurantFormState {
  return {
    name: site.name,
    serviceDays: site.service_days,
    serviceHours: site.service_hours,
    enabledTags: site.dietary_tags.map((tag) => tag.id),
    enabledCerts: site.certifications.map((cert) => cert.id),
    addressLabel: site.address_label ?? '',
    addressLat: site.address_lat ?? null,
    addressLon: site.address_lon ?? null,
    addressCity: site.address_city,
    addressPostcode: site.address_postcode,
    email: site.email ?? '',
    phone: site.phone ?? '',
    capacity: site.capacity != null ? String(site.capacity) : '',
    paymentMethods: site.payment_methods ?? ['izly', 'cb'],
    pmrAccess: site.pmr_access ?? null,
    voteEnabled: site.vote_enabled,
    voteCategoryIds: site.vote_category_ids ?? [],
    voteIconPreset: site.vote_icon_preset,
  };
}

interface Snapshots {
  restaurant: string;
  calendar: string;
}

export function useSettingsState() {
  const site = useSiteRef();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [serviceDays, setServiceDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [serviceHours, setServiceHours] = useState<ServiceHours>({});
  const [sameHoursForAll, setSameHoursForAll] = useState(true);
  const [enabledTags, setEnabledTags] = useState<string[]>([]);
  const [enabledCerts, setEnabledCerts] = useState<string[]>([]);
  const [addressLabel, setAddressLabel] = useState('');
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLon, setAddressLon] = useState<number | null>(null);
  const [addressCity, setAddressCity] = useState<string | null>(null);
  const [addressPostcode, setAddressPostcode] = useState<string | null>(null);
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [capacity, setCapacity] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(['izly', 'cb']);
  const [pmrAccess, setPmrAccess] = useState<boolean | null>(null);

  const [voteEnabled, setVoteEnabled] = useState(true);
  const [voteCategoryIds, setVoteCategoryIds] = useState<number[]>([]);
  const [voteIconPreset, setVoteIconPreset] = useState(DEFAULT_PRESET_ID);
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings | null>(null);

  // State, not a ref: `hasChanges` is derived from these, and a ref mutation
  // would not render again.
  const [baseline, setBaseline] = useState<Snapshots>({
    restaurant: '',
    calendar: '',
  });

  const restaurantState: RestaurantFormState = {
    name,
    serviceDays,
    serviceHours,
    enabledTags,
    enabledCerts,
    addressLabel,
    addressLat,
    addressLon,
    addressCity,
    addressPostcode,
    email,
    phone,
    capacity,
    paymentMethods,
    pmrAccess,
    voteEnabled,
    voteCategoryIds,
    voteIconPreset,
  };
  const restaurantSnapshot = serializeRestaurantState(restaurantState);
  const calendarSnapshot = JSON.stringify(calendarSettings);

  const hasChanges = useMemo(() => {
    if (isLoading || baseline.restaurant === '') return false;
    return (
      restaurantSnapshot !== baseline.restaurant ||
      (calendarSettings !== null && calendarSnapshot !== baseline.calendar)
    );
  }, [isLoading, baseline, restaurantSnapshot, calendarSnapshot, calendarSettings]);

  const applyForm = useCallback((form: RestaurantFormState) => {
    setName(form.name);
    setServiceDays(form.serviceDays);
    setServiceHours(form.serviceHours);
    setEnabledTags(form.enabledTags);
    setEnabledCerts(form.enabledCerts);
    setAddressLabel(form.addressLabel);
    setAddressLat(form.addressLat);
    setAddressLon(form.addressLon);
    setAddressCity(form.addressCity);
    setAddressPostcode(form.addressPostcode);
    setAddressConfirmed(!form.addressLabel || (form.addressLat != null && form.addressLon != null));
    setEmail(form.email);
    setPhone(form.phone);
    setCapacity(form.capacity);
    setPaymentMethods(form.paymentMethods);
    setPmrAccess(form.pmrAccess);
    setVoteEnabled(form.voteEnabled);
    setVoteCategoryIds(form.voteCategoryIds);
    setVoteIconPreset(form.voteIconPreset);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [own, loadedCalendar] = await Promise.all([
          sitesApi.getOwn(site),
          sitesApi.getCalendarSettings(site).catch(() => null),
        ]);
        const form = formOf(own);
        const hourValues = Object.values(form.serviceHours);
        const allSame = hourValues.every(
          (h) => h.open === hourValues[0].open && h.close === hourValues[0].close
        );

        applyForm(form);
        setSameHoursForAll(allSame);
        setCalendarSettings(loadedCalendar);
        setBaseline({
          restaurant: serializeRestaurantState(form),
          calendar: JSON.stringify(loadedCalendar),
        });
      } catch {
        // The page then shows an empty state.
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [site, applyForm]);

  const saveAll = useCallback(async (): Promise<SaveOutcome> => {
    const nErr = validateSiteName(name);
    const eErr = validateEmail(email);
    const pErr = validatePhone(phone);
    setNameError(nErr);
    setEmailError(eErr);
    setPhoneError(pErr);
    if (nErr || eErr || pErr || (!!addressLabel && !addressConfirmed)) {
      return 'validation-error';
    }

    const restaurantDirty = restaurantSnapshot !== baseline.restaurant;
    const calendarDirty = calendarSettings !== null && calendarSnapshot !== baseline.calendar;
    if (!restaurantDirty && !calendarDirty) return 'noop';

    setIsSaving(true);
    const failures: string[] = [];

    try {
      if (restaurantDirty) {
        try {
          const form = formOf(
            await sitesApi.update(site, {
              name,
              service_days: serviceDays,
              service_hours: serviceHours,
              address_label: addressLabel || null,
              address_lat: addressLat,
              address_lon: addressLon,
              address_city: addressCity,
              address_postcode: addressPostcode,
              email: email || null,
              phone: phone || null,
              capacity: capacity ? Number(capacity) : null,
              payment_methods: paymentMethods,
              pmr_access: pmrAccess,
              tag_ids: enabledTags,
              certification_ids: enabledCerts,
              vote_enabled: voteEnabled,
              vote_category_ids: voteCategoryIds,
              vote_icon_preset: voteIconPreset,
            })
          );
          applyForm(form);
          setBaseline((previous) => ({ ...previous, restaurant: serializeRestaurantState(form) }));
        } catch {
          failures.push('paramètres du restaurant');
        }
      }

      if (calendarDirty && calendarSettings) {
        try {
          const saved = await sitesApi.updateCalendarSettings(site, calendarSettings);
          setCalendarSettings(saved);
          setBaseline((previous) => ({ ...previous, calendar: JSON.stringify(saved) }));
        } catch {
          failures.push('paramètres des calendriers');
        }
      }
    } finally {
      setIsSaving(false);
    }

    if (failures.length === 0) {
      notify.success('Réglages enregistrés !');
      return 'saved';
    }
    notify.error(`Erreur lors de l'enregistrement : ${failures.join(', ')}`);
    return 'partial';
  }, [
    site,
    applyForm,
    email,
    phone,
    addressLabel,
    addressConfirmed,
    addressLat,
    addressLon,
    addressCity,
    addressPostcode,
    name,
    serviceDays,
    serviceHours,
    capacity,
    paymentMethods,
    pmrAccess,
    enabledTags,
    enabledCerts,
    voteEnabled,
    voteCategoryIds,
    voteIconPreset,
    calendarSettings,
    restaurantSnapshot,
    calendarSnapshot,
    baseline,
  ]);

  return {
    isLoading,
    isSaving,
    hasChanges,
    saveAll,
    name,
    setName,
    nameError,
    setNameError,
    serviceDays,
    setServiceDays,
    serviceHours,
    setServiceHours,
    sameHoursForAll,
    setSameHoursForAll,
    enabledTags,
    setEnabledTags,
    enabledCerts,
    setEnabledCerts,
    addressLabel,
    setAddressLabel,
    addressLat,
    setAddressLat,
    addressLon,
    setAddressLon,
    setAddressCity,
    setAddressPostcode,
    addressConfirmed,
    setAddressConfirmed,
    email,
    setEmail,
    emailError,
    setEmailError,
    phone,
    setPhone,
    phoneError,
    setPhoneError,
    capacity,
    setCapacity,
    paymentMethods,
    setPaymentMethods,
    voteEnabled,
    setVoteEnabled,
    voteCategoryIds,
    setVoteCategoryIds,
    voteIconPreset,
    setVoteIconPreset,
    pmrAccess,
    setPmrAccess,
    calendarSettings,
    setCalendarSettings,
  };
}

export type SettingsState = ReturnType<typeof useSettingsState>;
