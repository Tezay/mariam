/**
 * Onglet Accessibilité : accès PMR et méthodes de paiement.
 */
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Accessibility, CreditCard } from 'lucide-react';
import { PAYMENT_OPTIONS } from './settings-shared';
import type { SettingsState } from './useSettingsState';

export function AccessibiliteTab({ state }: { state: SettingsState }) {
    const { pmrAccess, setPmrAccess, paymentMethods, setPaymentMethods } = state;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Accessibilité & paiements</CardTitle>
                <CardDescription>Informations pratiques affichées dans la fiche du restaurant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <Label className="flex items-center gap-1.5 mb-3">
                        <Accessibility className="w-4 h-4" />
                        Accessibilité PMR
                    </Label>
                    <div className="flex items-center gap-4">
                        {([null, true, false] as const).map((val) => (
                            <label key={String(val)} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                <input
                                    type="radio"
                                    name="pmr_access"
                                    checked={pmrAccess === val}
                                    onChange={() => setPmrAccess(val)}
                                />
                                {val === null ? 'Non renseigné' : val ? 'Accessible' : 'Non accessible'}
                            </label>
                        ))}
                    </div>
                </div>

                <div>
                    <Label className="flex items-center gap-1.5 mb-3">
                        <CreditCard className="w-4 h-4" />
                        Méthodes de paiement acceptées
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {PAYMENT_OPTIONS.map((opt) => (
                            <label key={opt.id} className="flex items-center gap-2 cursor-pointer text-sm p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                                <input
                                    type="checkbox"
                                    checked={paymentMethods.includes(opt.id)}
                                    onChange={(e) => setPaymentMethods(prev =>
                                        e.target.checked ? [...prev, opt.id] : prev.filter(m => m !== opt.id)
                                    )}
                                    className="rounded"
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
