/**
 * Onglet Horaires : jours de service et horaires d'ouverture.
 */
import { ServiceHours } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DAY_NAMES } from './settings-shared';
import type { SettingsState } from './useSettingsState';

export function HorairesTab({ state }: { state: SettingsState }) {
    const {
        serviceDays, setServiceDays,
        serviceHours, setServiceHours,
        sameHoursForAll, setSameHoursForAll,
    } = state;

    const toggleDay = (day: number) => {
        setServiceDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Jours et horaires de service</CardTitle>
                <CardDescription>Sélectionnez les jours d'ouverture et les horaires associés</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="flex flex-wrap gap-2">
                    {DAY_NAMES.map((day, index) => (
                        <button
                            key={index}
                            onClick={() => toggleDay(index)}
                            className={`px-4 py-2 rounded-lg border-2 transition-all ${
                                serviceDays.includes(index)
                                    ? 'border-primary bg-primary/10 text-primary font-medium'
                                    : 'border-border text-muted-foreground hover:border-muted-foreground'
                            }`}
                        >
                            {day}
                        </button>
                    ))}
                </div>
                <p className="text-sm text-muted-foreground">
                    {serviceDays.length} jour{serviceDays.length > 1 ? 's' : ''} de service par semaine
                </p>

                {serviceDays.length > 0 && (
                    <div className="space-y-4 pt-2 border-t border-border">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={sameHoursForAll}
                                onChange={(e) => {
                                    setSameHoursForAll(e.target.checked);
                                    if (e.target.checked) {
                                        const first = Object.values(serviceHours)[0] ?? { open: '11:30', close: '14:00' };
                                        const unified: ServiceHours = {};
                                        serviceDays.forEach(d => { unified[String(d)] = { ...first }; });
                                        setServiceHours(unified);
                                    }
                                }}
                                className="rounded"
                            />
                            <span className="text-sm font-medium">Mêmes horaires pour tous les jours</span>
                        </label>

                        {sameHoursForAll ? (
                            <div className="flex items-center gap-4">
                                <div>
                                    <Label className="text-xs text-muted-foreground mb-1 block">Ouverture</Label>
                                    <Input
                                        type="time"
                                        className="w-32"
                                        value={Object.values(serviceHours)[0]?.open ?? '11:30'}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setServiceHours(prev => {
                                                const next: ServiceHours = {};
                                                serviceDays.forEach(d => { next[String(d)] = { open: val, close: prev[String(d)]?.close ?? '14:00' }; });
                                                return next;
                                            });
                                        }}
                                    />
                                </div>
                                <span className="text-muted-foreground mt-5">→</span>
                                <div>
                                    <Label className="text-xs text-muted-foreground mb-1 block">Fermeture</Label>
                                    <Input
                                        type="time"
                                        className="w-32"
                                        value={Object.values(serviceHours)[0]?.close ?? '14:00'}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setServiceHours(prev => {
                                                const next: ServiceHours = {};
                                                serviceDays.forEach(d => { next[String(d)] = { open: prev[String(d)]?.open ?? '11:30', close: val }; });
                                                return next;
                                            });
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {[...serviceDays].sort((a, b) => a - b).map(d => (
                                    <div key={d} className="flex items-center gap-4">
                                        <span className="w-24 text-sm font-medium">{DAY_NAMES[d]}</span>
                                        <div>
                                            <Label className="text-xs text-muted-foreground mb-1 block">Ouverture</Label>
                                            <Input
                                                type="time"
                                                className="w-32"
                                                value={serviceHours[String(d)]?.open ?? '11:30'}
                                                onChange={(e) => setServiceHours(prev => ({
                                                    ...prev,
                                                    [String(d)]: { open: e.target.value, close: prev[String(d)]?.close ?? '14:00' },
                                                }))}
                                            />
                                        </div>
                                        <span className="text-muted-foreground mt-5">→</span>
                                        <div>
                                            <Label className="text-xs text-muted-foreground mb-1 block">Fermeture</Label>
                                            <Input
                                                type="time"
                                                className="w-32"
                                                value={serviceHours[String(d)]?.close ?? '14:00'}
                                                onChange={(e) => setServiceHours(prev => ({
                                                    ...prev,
                                                    [String(d)]: { open: prev[String(d)]?.open ?? '11:30', close: e.target.value },
                                                }))}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
