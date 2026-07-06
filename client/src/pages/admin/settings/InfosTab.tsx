/**
 * Onglet Infos : nom, adresse (autocomplétion BAN), contact et capacité.
 */
import { useState, useRef } from 'react';
import { banApi, BanSuggestion } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { validateEmail, validatePhone } from './settings-shared';
import type { SettingsState } from './useSettingsState';

export function InfosTab({ state }: { state: SettingsState }) {
    const {
        name, setName,
        addressLabel, setAddressLabel, setAddressLat, setAddressLon,
        addressLat, addressLon, addressConfirmed, setAddressConfirmed,
        email, setEmail, emailError, setEmailError,
        phone, setPhone, phoneError, setPhoneError,
        capacity, setCapacity,
    } = state;

    const [banSuggestions, setBanSuggestions] = useState<BanSuggestion[]>([]);
    const [banOpen, setBanOpen] = useState(false);
    const banDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Informations générales</CardTitle>
                <CardDescription>Nom, coordonnées et capacité du restaurant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="name">Nom du restaurant</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurant Universitaire" />
                </div>

                {/* Adresse BAN */}
                <div>
                    <Label htmlFor="address">Adresse</Label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
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
                                if (!val) { setBanSuggestions([]); setBanOpen(false); return; }
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
                            <ul className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                                {banSuggestions.map((s, i) => (
                                    <li
                                        key={i}
                                        className="px-4 py-2.5 text-sm cursor-pointer hover:bg-muted transition-colors"
                                        onMouseDown={() => {
                                            setAddressLabel(s.label);
                                            setAddressLat(s.lat);
                                            setAddressLon(s.lon);
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
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
                            onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(null); }}
                            onBlur={(e) => setPhoneError(validatePhone(e.target.value))}
                            placeholder="+33 1 23 45 67 89"
                            className={phoneError ? 'border-destructive focus-visible:ring-destructive' : ''}
                        />
                        {phoneError && <p className="mt-1 text-xs text-destructive">{phoneError}</p>}
                    </div>
                </div>

                <div className="sm:w-1/3">
                    <Label htmlFor="capacity">Capacité d'accueil</Label>
                    <Input
                        id="capacity"
                        type="number"
                        min={10}
                        max={10000}
                        step={10}
                        value={capacity}
                        onChange={(e) => setCapacity(e.target.value)}
                        onBlur={(e) => {
                            const raw = Number(e.target.value);
                            if (!e.target.value || isNaN(raw)) { setCapacity(''); return; }
                            const clamped = Math.min(10000, Math.max(10, Math.round(raw / 10) * 10));
                            setCapacity(String(clamped));
                        }}
                        placeholder="Nombre de couverts"
                    />
                </div>
            </CardContent>
        </Card>
    );
}
