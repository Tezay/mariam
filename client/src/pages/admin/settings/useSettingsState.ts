/**
 * État global de la page Mon restaurant.
 *
 * Regroupe les trois sections sauvegardées par le bouton « Enregistrer » commun :
 * - restaurant (Infos, Horaires, Accessibilité, Tags & Labels) → PUT /settings
 * - calendar (Calendriers, par restaurant)                     → PUT /restaurant/calendar-settings
 *
 * Le dirty tracking compare chaque section à un snapshot sérialisé pris au
 * chargement, mis à jour section par section après une sauvegarde réussie
 * (une section en échec reste marquée comme modifiée).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { notify } from '@/lib/toast';
import { DEFAULT_PRESET_ID } from '@/features/rating/scale';
import { adminApi, CalendarSettings } from '@/lib/api/admin';
import { DietaryTag, CertificationItem } from '@/lib/api/taxonomy';
import { ServiceHours, RestaurantWithConfig } from '@/lib/api/restaurant';
import {
  validateEmail,
  validatePhone,
  serializeRestaurantState,
  RestaurantFormState,
} from './settings-shared';

export type SaveOutcome = 'saved' | 'partial' | 'validation-error' | 'noop';

interface Snapshots {
  restaurant: string;
  calendar: string;
}

export function useSettingsState() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ── Section restaurant ───────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [serviceDays, setServiceDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [serviceHours, setServiceHours] = useState<ServiceHours>({});
  const [sameHoursForAll, setSameHoursForAll] = useState(true);
  const [enabledTags, setEnabledTags] = useState<string[]>([]);
  const [enabledCerts, setEnabledCerts] = useState<string[]>([]);
  const [addressLabel, setAddressLabel] = useState('');
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLon, setAddressLon] = useState<number | null>(null);
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [capacity, setCapacity] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['izly', 'cb']);
  const [pmrAccess, setPmrAccess] = useState<boolean | null>(null);

  // ── Sections notifications & calendriers ────────────────────────────────
  const [voteEnabled, setVoteEnabled] = useState(true);
  const [voteCategoryIds, setVoteCategoryIds] = useState<number[]>([]);
  const [voteIconPreset, setVoteIconPreset] = useState(DEFAULT_PRESET_ID);
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings | null>(null);

  // State, not a ref: `hasChanges` is derived from these, and a ref mutation
  // would leave the unsaved-changes guard armed after a successful save.
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

  // ── Chargement initial ───────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [data, loadedCalendar] = await Promise.all([
          adminApi.getSettings(),
          adminApi.getCalendarSettings().catch(() => null),
        ]);

        const loadedName = data.name || '';
        const loadedServiceDays = data.config?.service_days || [0, 1, 2, 3, 4];
        const loadedServiceHours: ServiceHours = data.config?.service_hours || {};
        const loadedTags = (data.config?.dietary_tags || []).map((t: DietaryTag) => t.id);
        const loadedCerts = (data.config?.certifications || []).map((c: CertificationItem) => c.id);
        const loadedAddressLabel = data.address_label || '';
        const loadedEmail = data.email || '';
        const loadedPhone = data.phone || '';
        const loadedCapacity = data.capacity != null ? String(data.capacity) : '';
        const loadedPayments = data.payment_methods || ['izly', 'cb'];
        const loadedPmr = data.pmr_access ?? null;
        const loadedLat = data.address_lat ?? null;
        const loadedLon = data.address_lon ?? null;
        const loadedVoteEnabled = data.config?.vote_enabled ?? true;
        const loadedVoteCategories = data.config?.vote_category_ids ?? [];
        const loadedVotePreset = data.config?.vote_icon_preset ?? DEFAULT_PRESET_ID;

        // Tous les jours actifs partagent-ils les mêmes horaires ?
        const hourValues = Object.values(loadedServiceHours);
        const allSame =
          hourValues.length > 0 &&
          hourValues.every((h) => h.open === hourValues[0].open && h.close === hourValues[0].close);

        setName(loadedName);
        setServiceDays(loadedServiceDays);
        setServiceHours(loadedServiceHours);
        setSameHoursForAll(hourValues.length === 0 || allSame);
        setEnabledTags(loadedTags);
        setEnabledCerts(loadedCerts);
        setAddressLabel(loadedAddressLabel);
        setAddressLat(loadedLat);
        setAddressLon(loadedLon);
        setAddressConfirmed(!loadedAddressLabel || (loadedLat != null && loadedLon != null));
        setEmail(loadedEmail);
        setPhone(loadedPhone);
        setCapacity(loadedCapacity);
        setPaymentMethods(loadedPayments);
        setPmrAccess(loadedPmr);
        setVoteEnabled(loadedVoteEnabled);
        setVoteCategoryIds(loadedVoteCategories);
        setVoteIconPreset(loadedVotePreset);
        setCalendarSettings(loadedCalendar);

        setBaseline({
          restaurant: serializeRestaurantState({
            name: loadedName,
            serviceDays: loadedServiceDays,
            serviceHours: loadedServiceHours,
            enabledTags: loadedTags,
            enabledCerts: loadedCerts,
            addressLabel: loadedAddressLabel,
            addressLat: loadedLat,
            addressLon: loadedLon,
            email: loadedEmail,
            phone: loadedPhone,
            capacity: loadedCapacity,
            paymentMethods: loadedPayments,
            pmrAccess: loadedPmr,
            voteEnabled: loadedVoteEnabled,
            voteCategoryIds: loadedVoteCategories,
            voteIconPreset: loadedVotePreset,
          }),
          calendar: JSON.stringify(loadedCalendar),
        });
      } catch {
        // ignore — la page affiche un état vide
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // ── Sauvegarde unifiée (les 3 sections) ──────────────────────────────────
  const saveAll = useCallback(async (): Promise<SaveOutcome> => {
    const eErr = validateEmail(email);
    const pErr = validatePhone(phone);
    setEmailError(eErr);
    setPhoneError(pErr);
    if (eErr || pErr || (!!addressLabel && !addressConfirmed)) {
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
          const saved = (await adminApi.updateSettings({
            name,
            service_days: serviceDays,
            service_hours: serviceHours,
            address_label: addressLabel || null,
            address_lat: addressLat,
            address_lon: addressLon,
            email: email || null,
            phone: phone || null,
            capacity: capacity ? Number(capacity) : null,
            payment_methods: paymentMethods,
            pmr_access: pmrAccess,
            dietary_tags: enabledTags,
            certifications: enabledCerts,
            vote_enabled: voteEnabled,
            vote_category_ids: voteCategoryIds,
            vote_icon_preset: voteIconPreset,
          })) as RestaurantWithConfig;

          // Recharger l'état canonique depuis la réponse serveur
          const savedLabel = saved.address_label || '';
          const savedLat = saved.address_lat ?? null;
          const savedLon = saved.address_lon ?? null;
          const savedEmail = saved.email || '';
          const savedPhone = saved.phone || '';
          const savedCapacity = saved.capacity != null ? String(saved.capacity) : '';
          const savedPayments = saved.payment_methods || [];
          const savedPmr = saved.pmr_access ?? null;
          const savedDays = saved.config?.service_days ?? serviceDays;
          const savedVoteEnabled = saved.config?.vote_enabled ?? voteEnabled;
          const savedVoteCategories = saved.config?.vote_category_ids ?? voteCategoryIds;
          const savedVotePreset = saved.config?.vote_icon_preset ?? voteIconPreset;
          const savedHours = saved.config?.service_hours ?? serviceHours;
          const savedTags = (saved.config?.dietary_tags || []).map((t: DietaryTag) => t.id);
          const savedCerts = (saved.config?.certifications || []).map(
            (c: CertificationItem) => c.id
          );

          setName(saved.name || name);
          setAddressLabel(savedLabel);
          setAddressLat(savedLat);
          setAddressLon(savedLon);
          setAddressConfirmed(!savedLabel || (savedLat != null && savedLon != null));
          setEmail(savedEmail);
          setPhone(savedPhone);
          setCapacity(savedCapacity);
          setPaymentMethods(savedPayments);
          setPmrAccess(savedPmr);
          setServiceDays(savedDays);
          setServiceHours(savedHours);
          setEnabledTags(savedTags);
          setEnabledCerts(savedCerts);
          setVoteEnabled(savedVoteEnabled);
          setVoteCategoryIds(savedVoteCategories);
          setVoteIconPreset(savedVotePreset);

          setBaseline((previous) => ({
            ...previous,
            restaurant: serializeRestaurantState({
              name: saved.name || name,
              serviceDays: savedDays,
              serviceHours: savedHours,
              enabledTags: savedTags,
              enabledCerts: savedCerts,
              voteEnabled: savedVoteEnabled,
              voteCategoryIds: savedVoteCategories,
              voteIconPreset: savedVotePreset,
              addressLabel: savedLabel,
              addressLat: savedLat,
              addressLon: savedLon,
              email: savedEmail,
              phone: savedPhone,
              capacity: savedCapacity,
              paymentMethods: savedPayments,
              pmrAccess: savedPmr,
            }),
          }));
        } catch {
          failures.push('paramètres du restaurant');
        }
      }

      if (calendarDirty && calendarSettings) {
        try {
          const saved = await adminApi.updateCalendarSettings(calendarSettings);
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
    email,
    phone,
    addressLabel,
    addressConfirmed,
    addressLat,
    addressLon,
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
