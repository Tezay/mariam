import { useState, useRef } from 'react';
import { banApi, BanSuggestion } from '@/lib/api/geocoding';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Gauge, MapPin } from 'lucide-react';
import { CapacityGauge } from '@/components/CapacityGauge';
import { SERVICE_CAPACITY_MAX } from '@/lib/site-profile';
import { validateSiteName, validateEmail, validatePhone } from './settings-shared';
import type { SettingsState } from './useSettingsState';

// A winter instant, so the example reads 12h05 all year.
const EXAMPLE_REACHED_AT = '2026-01-15T11:05:00Z';

export function InfosTab({ state }: { state: SettingsState }) {
  const {
    name,
    setName,
    nameError,
    setNameError,
    addressLabel,
    setAddressLabel,
    setAddressLat,
    setAddressLon,
    setAddressCity,
    setAddressPostcode,
    addressLat,
    addressLon,
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
    serviceCapacity,
    setServiceCapacity,
  } = state;

  const [banSuggestions, setBanSuggestions] = useState<BanSuggestion[]>([]);
  const [banOpen, setBanOpen] = useState(false);
  const banDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meals = Number(serviceCapacity);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
          <CardDescription>Nom et coordonnées du restaurant</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Nom du restaurant</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              onBlur={(e) => setNameError(validateSiteName(e.target.value))}
              placeholder="Restaurant Universitaire"
              className={nameError ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {nameError ? (
              <p className="mt-1 text-xs text-destructive">{nameError}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Il s'affiche sur le menu public et dans les invitations envoyées par e-mail.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="address">Adresse</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="address"
                value={addressLabel}
                className="pl-9"
                placeholder="Rechercher une adresse…"
                autoComplete="off"
                onChange={(e) => {
                  const val = e.target.value;
                  setAddressLabel(val);
                  setAddressConfirmed(!val);
                  setAddressLat(null);
                  setAddressLon(null);
                  setAddressCity(null);
                  setAddressPostcode(null);
                  if (!val) {
                    setBanSuggestions([]);
                    setBanOpen(false);
                    return;
                  }
                  if (banDebounceRef.current) clearTimeout(banDebounceRef.current);
                  banDebounceRef.current = setTimeout(async () => {
                    const suggestions = await banApi.search(val);
                    setBanSuggestions(suggestions);
                    setBanOpen(suggestions.length > 0);
                  }, 300);
                }}
                onBlur={() => setTimeout(() => setBanOpen(false), 150)}
                onFocus={() => banSuggestions.length > 0 && setBanOpen(true)}
              />
              {banOpen && banSuggestions.length > 0 && (
                <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                  {banSuggestions.map((s, i) => (
                    <li
                      key={i}
                      className="cursor-pointer px-4 py-2.5 text-sm transition-colors hover:bg-muted"
                      onMouseDown={() => {
                        setAddressLabel(s.label);
                        setAddressLat(s.lat);
                        setAddressLon(s.lon);
                        setAddressCity(s.city);
                        setAddressPostcode(s.postcode);
                        setAddressConfirmed(true);
                        setBanSuggestions([]);
                        setBanOpen(false);
                      }}
                    >
                      {s.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {addressLabel && !addressConfirmed && (
              <p className="mt-1 text-xs text-destructive">
                Sélectionnez une adresse dans la liste pour la valider.
              </p>
            )}
            {addressConfirmed && addressLat != null && addressLon != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                {addressLat.toFixed(5)}, {addressLon.toFixed(5)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                onBlur={(e) => setEmailError(validateEmail(e.target.value))}
                placeholder="contact@ru.fr"
                className={emailError ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {emailError && <p className="mt-1 text-xs text-destructive">{emailError}</p>}
            </div>
            <div>
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (phoneError) setPhoneError(null);
                }}
                onBlur={(e) => setPhoneError(validatePhone(e.target.value))}
                placeholder="+33 1 23 45 67 89"
                className={phoneError ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {phoneError && <p className="mt-1 text-xs text-destructive">{phoneError}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-muted-foreground" />
            Capacité maximale
          </CardTitle>
          <CardDescription>
            Le nombre de repas que l'équipe peut servir à chaque service. Votre page publique
            l'affiche, et l'équipe y indique depuis « Service en cours » quand il est atteint.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="service-capacity">Repas par service</Label>
            <Input
              id="service-capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={SERVICE_CAPACITY_MAX}
              value={serviceCapacity}
              aria-describedby="service-capacity-help"
              onChange={(e) => setServiceCapacity(e.target.value)}
              onBlur={(e) => {
                const raw = Math.round(Number(e.target.value));
                setServiceCapacity(
                  !e.target.value || Number.isNaN(raw)
                    ? ''
                    : String(Math.min(SERVICE_CAPACITY_MAX, Math.max(1, raw)))
                );
              }}
              className="w-32"
            />
            <p id="service-capacity-help" className="text-xs text-muted-foreground">
              Laissez vide pour ne pas l'afficher.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Aperçu sur votre page
            </p>
            {meals > 0 ? (
              <div className="space-y-2 rounded-2xl bg-site-page p-3 text-site-text">
                <CapacityGauge capacity={meals} state="available" reachedAt={null} />
                <CapacityGauge capacity={meals} state="reached" reachedAt={EXAMPLE_REACHED_AT} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Saisissez un nombre de repas pour voir la vignette.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
