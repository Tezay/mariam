/**
 * État global de la page Paramètres.
 *
 * Regroupe les trois sections sauvegardées par le bouton « Enregistrer » commun :
 * - restaurant (Infos, Horaires, Accessibilité, Tags & Labels) → PUT /settings
 * - prefs (Notifications, par utilisateur)                     → PUT /inbox/notification-preferences
 * - calendar (Calendriers, par restaurant)                     → PUT /restaurant/calendar-settings
 *
 * Le dirty tracking compare chaque section à un snapshot sérialisé pris au
 * chargement, mis à jour section par section après une sauvegarde réussie
 * (une section en échec reste marquée comme modifiée).
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { notify } from '@/lib/toast';
import {
  adminApi,
  inboxApi,
  DietaryTag,
  CertificationItem,
  ServiceHours,
  RestaurantWithConfig,
  NotifPreferences,
  CalendarSettings,
} from '@/lib/api';
import {
  validateEmail,
  validatePhone,
  serializeRestaurantState,
  RestaurantFormState,
} from './settings-shared';

export type SaveOutcome = 'saved' | 'partial' | 'validation-error' | 'noop';

interface Snapshots {
  restaurant: string;
  prefs: string;
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
  const [prefs, setPrefs] = useState<NotifPreferences | null>(null);
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings | null>(null);

  const snapshotsRef = useRef<Snapshots>({ restaurant: '', prefs: '', calendar: '' });

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
  };
  const restaurantSnapshot = serializeRestaurantState(restaurantState);
  const prefsSnapshot = JSON.stringify(prefs);
  const calendarSnapshot = JSON.stringify(calendarSettings);

  const hasChanges = useMemo(() => {
    if (isLoading || snapshotsRef.current.restaurant === '') return false;
    return (
      restaurantSnapshot !== snapshotsRef.current.restaurant ||
      (prefs !== null && prefsSnapshot !== snapshotsRef.current.prefs) ||
      (calendarSettings !== null && calendarSnapshot !== snapshotsRef.current.calendar)
    );
  }, [isLoading, restaurantSnapshot, prefsSnapshot, calendarSnapshot, prefs, calendarSettings]);

  // ── Chargement initial ───────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [data, loadedPrefs, loadedCalendar] = await Promise.all([
          adminApi.getSettings(),
          inboxApi.getNotifPreferences().catch(() => null),
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
        setPrefs(loadedPrefs);
        setCalendarSettings(loadedCalendar);

        snapshotsRef.current = {
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
          }),
          prefs: JSON.stringify(loadedPrefs),
          calendar: JSON.stringify(loadedCalendar),
        };
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

    const restaurantDirty = restaurantSnapshot !== snapshotsRef.current.restaurant;
    const prefsDirty = prefs !== null && prefsSnapshot !== snapshotsRef.current.prefs;
    const calendarDirty =
      calendarSettings !== null && calendarSnapshot !== snapshotsRef.current.calendar;
    if (!restaurantDirty && !prefsDirty && !calendarDirty) return 'noop';

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

          snapshotsRef.current.restaurant = serializeRestaurantState({
            name: saved.name || name,
            serviceDays: savedDays,
            serviceHours: savedHours,
            enabledTags: savedTags,
            enabledCerts: savedCerts,
            addressLabel: savedLabel,
            addressLat: savedLat,
            addressLon: savedLon,
            email: savedEmail,
            phone: savedPhone,
            capacity: savedCapacity,
            paymentMethods: savedPayments,
            pmrAccess: savedPmr,
          });
        } catch {
          failures.push('paramètres du restaurant');
        }
      }

      if (prefsDirty && prefs) {
        try {
          const saved = await inboxApi.updateNotifPreferences(prefs);
          setPrefs(saved);
          snapshotsRef.current.prefs = JSON.stringify(saved);
        } catch {
          failures.push('préférences de notifications');
        }
      }

      if (calendarDirty && calendarSettings) {
        try {
          const saved = await adminApi.updateCalendarSettings(calendarSettings);
          setCalendarSettings(saved);
          snapshotsRef.current.calendar = JSON.stringify(saved);
        } catch {
          failures.push('paramètres des calendriers');
        }
      }
    } finally {
      setIsSaving(false);
    }

    if (failures.length === 0) {
      notify.success('Paramètres enregistrés !');
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
    prefs,
    calendarSettings,
    restaurantSnapshot,
    prefsSnapshot,
    calendarSnapshot,
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
    pmrAccess,
    setPmrAccess,
    prefs,
    setPrefs,
    calendarSettings,
    setCalendarSettings,
  };
}

export type SettingsState = ReturnType<typeof useSettingsState>;
