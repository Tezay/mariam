/**
 * MARIAM — Page de configuration des notifications push.
 *
 * Guide l'utilisateur selon sa plateforme :
 * - iOS : instruction d'installation PWA, puis activation des notifications
 * - Android : activation directe (+ suggestion d'installation optionnelle)
 * - Desktop : activation directe
 *
 * Permet de configurer :
 * - Notification du menu du jour + horaire
 * - Notification du menu du lendemain + horaire
 * - Notification des événements
 * - Envoi d'une notification de test
 * - Désabonnement
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import {
    Bell, BellOff, ArrowLeft, ChevronRight, Clock,
    Smartphone, Download, CheckCircle2, AlertTriangle,
    Send, Loader2, Share, Plus
} from 'lucide-react';
import {
    detectPlatform,
    isPwaInstalled,
    isPushSupported,
    requiresPwaForPush,
    getExistingSubscription,
    subscribeToPush,
    unsubscribeFromPush,
    updatePreferences,
    getServerPreferences,
    sendTestNotification,
    DEFAULT_PREFERENCES,
    type NotificationPreferences,
    type Platform,
} from '@/lib/push';


// ========================================
// Composants internes
// ========================================

/** Toggle switch réutilisable */
function Toggle({ checked, onChange, label, description }: {
    checked: boolean;
    onChange: (val: boolean) => void;
    label: string;
    description?: string;
}) {
    return (
        <label className="flex items-center justify-between py-3 cursor-pointer group">
            <div className="flex-1 pr-4">
                <p className="font-medium text-gray-900">{label}</p>
                {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-mariam-blue focus:ring-offset-2 ${checked ? 'bg-mariam-blue' : 'bg-gray-300'
                    }`}
            >
                <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'
                        }`}
                />
            </button>
        </label>
    );
}

/** Sélecteur d'heure simplifié (HH:MM) */
function TimeSelector({ value, onChange, disabled }: {
    value: string;
    onChange: (val: string) => void;
    disabled?: boolean;
}) {
    return (
        <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <input
                type="time"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="border rounded-lg px-3 py-1.5 text-sm text-gray-700 disabled:opacity-50 disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-mariam-blue focus:border-transparent"
            />
        </div>
    );
}

/** Carte d'information avec icône */
function InfoCard({ icon, title, children, variant = 'info' }: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
    variant?: 'info' | 'warning' | 'success';
}) {
    const colors = {
        info: 'bg-blue-50 border-blue-200 text-blue-800',
        warning: 'bg-amber-50 border-amber-200 text-amber-800',
        success: 'bg-green-50 border-green-200 text-green-800',
    };
    return (
        <div className={`rounded-xl border p-4 ${colors[variant]}`}>
            <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">{icon}</div>
                <div>
                    <p className="font-semibold text-sm">{title}</p>
                    <div className="text-sm mt-1 opacity-90">{children}</div>
                </div>
            </div>
        </div>
    );
}


// ========================================
// Guide d'installation PWA (iOS)
// ========================================
function PwaInstallGuide() {
    return (
        <div className="space-y-4">
            <InfoCard
                icon={<Smartphone className="h-5 w-5" />}
                title="Installation requise sur iPhone / iPad"
                variant="warning"
            >
                <p>
                    Sur iOS, les notifications ne fonctionnent qu'après avoir ajouté Mariam
                    à votre écran d'accueil. C'est rapide (30 secondes) :
                </p>
            </InfoCard>

            <div className="bg-white rounded-xl border border-gray-200 divide-y">
                <div className="flex items-start gap-4 p-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mariam-blue text-white text-sm font-bold shrink-0">1</div>
                    <div>
                        <p className="font-medium text-gray-900">Appuyez sur le bouton Partager</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                            En bas de Safari, appuyez sur l'icône <Share className="inline h-4 w-4 -mt-0.5" /> (carré avec une flèche vers le haut).
                        </p>
                    </div>
                </div>
                <div className="flex items-start gap-4 p-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mariam-blue text-white text-sm font-bold shrink-0">2</div>
                    <div>
                        <p className="font-medium text-gray-900">« Sur l'écran d'accueil »</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Faites défiler les options et appuyez sur <Plus className="inline h-4 w-4 -mt-0.5" /> <strong>Sur l'écran d'accueil</strong>.
                        </p>
                    </div>
                </div>
                <div className="flex items-start gap-4 p-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mariam-blue text-white text-sm font-bold shrink-0">3</div>
                    <div>
                        <p className="font-medium text-gray-900">Confirmez « Ajouter »</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Appuyez sur <strong>Ajouter</strong> en haut à droite. L'icône Mariam apparaît sur votre écran d'accueil.
                        </p>
                    </div>
                </div>
                <div className="flex items-start gap-4 p-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-white text-sm font-bold shrink-0">4</div>
                    <div>
                        <p className="font-medium text-gray-900">Ouvrez Mariam depuis l'écran d'accueil</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Lancez l'application, puis revenez sur cette page pour activer les notifications.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}


// ========================================
// Suggestion d'installation PWA (Android / Desktop)
// ========================================
function PwaInstallSuggestion({ onInstall }: { onInstall: () => void }) {
    return (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="flex items-start gap-3">
                <Download className="h-5 w-5 text-mariam-blue mt-0.5 shrink-0" />
                <div className="flex-1">
                    <p className="font-medium text-gray-900 text-sm">Ajouter à l'écran d'accueil</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Pour un accès rapide, vous pouvez ajouter Mariam à votre écran d'accueil.
                    </p>
                    <button
                        onClick={onInstall}
                        className="mt-2 text-sm font-medium text-mariam-blue hover:underline flex items-center gap-1"
                    >
                        Installer <ChevronRight className="h-3 w-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}


// ========================================
// Page principale
// ========================================
export function NotificationsPage() {
    const navigate = useNavigate();
    const [isInstalled] = useState(isPwaInstalled);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testSent, setTestSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Préférences
    const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);

    // PWA install prompt (Android/Desktop)
    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

    // Capturer l'événement beforeinstallprompt
    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            setInstallPrompt(e as BeforeInstallPromptEvent);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    // Charger l'état de souscription + préférences
    // Si le navigateur a une souscription mais que le serveur ne la connaît pas
    useEffect(() => {
        async function init() {
            try {
                const subscription = await getExistingSubscription();
                if (subscription) {
                    const serverPrefs = await getServerPreferences();
                    if (serverPrefs) {
                        setIsSubscribed(true);
                        setPrefs({
                            notify_today_menu: serverPrefs.notify_today_menu,
                            notify_today_menu_time: serverPrefs.notify_today_menu_time,
                            notify_tomorrow_menu: serverPrefs.notify_tomorrow_menu,
                            notify_tomorrow_menu_time: serverPrefs.notify_tomorrow_menu_time,
                            notify_events: serverPrefs.notify_events,
                        });
                    } else {
                        // Souscription locale orpheline -> désabonner côté navigateur
                        await subscription.unsubscribe();
                    }
                }
            } catch {
                // Silencieux (pas critique)
            } finally {
                setIsLoading(false);
            }
        }
        init();
    }, []);

    // Auto-hide success messages
    useEffect(() => {
        if (successMessage) {
            const t = setTimeout(() => setSuccessMessage(null), 3000);
            return () => clearTimeout(t);
        }
    }, [successMessage]);

    // ========================================
    // Actions
    // ========================================

    const handleSubscribe = useCallback(async () => {
        setError(null);
        setIsSaving(true);
        const result = await subscribeToPush(prefs);
        setIsSaving(false);
        if (result.success) {
            setIsSubscribed(true);
            setSuccessMessage('Notifications activées !');
        } else {
            setError(result.error || 'Erreur inconnue');
        }
    }, [prefs]);

    const handleUnsubscribe = useCallback(async () => {
        setError(null);
        setIsSaving(true);
        const result = await unsubscribeFromPush();
        setIsSaving(false);
        if (result.success) {
            setIsSubscribed(false);
            setPrefs(DEFAULT_PREFERENCES);
            setSuccessMessage('Notifications désactivées.');
        } else {
            setError(result.error || 'Erreur inconnue');
        }
    }, []);

    const handleSavePrefs = useCallback(async (newPrefs: NotificationPreferences) => {
        setPrefs(newPrefs);
        if (!isSubscribed) return;

        setIsSaving(true);
        const result = await updatePreferences(newPrefs);
        setIsSaving(false);
        if (result.success) {
            setSuccessMessage('Préférences enregistrées.');
        } else {
            setError(result.error || 'Erreur de sauvegarde');
        }
    }, [isSubscribed]);

    const handleTest = useCallback(async () => {
        setIsTesting(true);
        setTestSent(false);
        const result = await sendTestNotification();
        setIsTesting(false);
        if (result.success) {
            setTestSent(true);
            setTimeout(() => setTestSent(false), 5000);
        } else {
            setError(result.error || 'Erreur lors du test');
        }
    }, []);

    const handleInstallPwa = useCallback(async () => {
        if (!installPrompt) return;

        try {
            installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;
            if (outcome === 'accepted') {
                setSuccessMessage('Mariam a été ajouté à votre écran d\'accueil');
            }
        } catch (err) {
            console.error('PWA install error:', err);
        } finally {
            setInstallPrompt(null);
        }
    }, [installPrompt]);

    // ========================================
    // Conditions de blocage
    // ========================================

    const needsPwa = requiresPwaForPush();       // iOS non-PWA -> doit installer en premier
    const isSecure = window.isSecureContext;      // HTTP non-localhost -> SW indisponible
    const pushSupported = isPushSupported();      // Vérifié seulement si contexte sécurisé

    // ========================================
    // Rendu
    // ========================================

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-mariam-blue text-white p-4 flex items-center gap-3">
                <button
                    onClick={() => navigate('/menu')}
                    className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                    aria-label="Retour au menu"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <Logo className="h-8 w-auto" variant="light" />
                <span className="font-medium text-sm flex-1">Notifications</span>
            </header>

            <main className="max-w-lg mx-auto p-4 pb-8 space-y-6">
                {/* Messages de statut */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
                {successMessage && (
                    <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-sm flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{successMessage}</span>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-mariam-blue" />
                    </div>
                ) : needsPwa ? (
                    /* iOS : nécessite l'installation PWA avant tout */
                    <PwaInstallGuide />
                ) : !isSecure ? (
                    /* Contexte non sécurisé (HTTP + non-localhost) */
                    <InfoCard
                        icon={<AlertTriangle className="h-5 w-5" />}
                        title="Connexion non sécurisée"
                        variant="warning"
                    >
                        <p>
                            Les notifications push nécessitent une connexion sécurisée (HTTPS).
                            En production, cette page fonctionnera automatiquement.
                        </p>
                        <p className="mt-2 text-xs opacity-75">
                            En développement, accédez via <strong>localhost</strong> au lieu d'une adresse IP.
                        </p>
                    </InfoCard>
                ) : !pushSupported ? (
                    /* Navigateur non supporté */
                    <InfoCard
                        icon={<AlertTriangle className="h-5 w-5" />}
                        title="Navigateur non compatible"
                        variant="warning"
                    >
                        <p>
                            Votre navigateur ne supporte pas les notifications push.
                            Essayez avec Chrome (Android) ou Safari (iOS 16.4+).
                        </p>
                    </InfoCard>
                ) : (
                    /* Interface de configuration des notifications */
                    <div className="space-y-6">
                        {/* Activation principale */}
                        {!isSubscribed ? (
                            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center space-y-4">
                                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                                    <Bell className="h-8 w-8 text-mariam-blue" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">
                                        Recevez le menu du jour
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Soyez notifié chaque jour avec le menu du restaurant,
                                        directement sur votre téléphone.
                                    </p>
                                </div>

                                {/* Préférences pré-activation */}
                                <div className="text-left border-t pt-4 space-y-1">
                                    <Toggle
                                        checked={prefs.notify_today_menu}
                                        onChange={(v) => setPrefs(p => ({ ...p, notify_today_menu: v }))}
                                        label="Menu du jour"
                                        description="Notification quotidienne le matin"
                                    />
                                    {prefs.notify_today_menu && (
                                        <div className="pl-4 pb-2">
                                            <TimeSelector
                                                value={prefs.notify_today_menu_time}
                                                onChange={(v) => setPrefs(p => ({ ...p, notify_today_menu_time: v }))}
                                            />
                                        </div>
                                    )}
                                    <Toggle
                                        checked={prefs.notify_tomorrow_menu}
                                        onChange={(v) => setPrefs(p => ({ ...p, notify_tomorrow_menu: v }))}
                                        label="Menu du lendemain"
                                        description="Rappel la veille au soir"
                                    />
                                    {prefs.notify_tomorrow_menu && (
                                        <div className="pl-4 pb-2">
                                            <TimeSelector
                                                value={prefs.notify_tomorrow_menu_time}
                                                onChange={(v) => setPrefs(p => ({ ...p, notify_tomorrow_menu_time: v }))}
                                            />
                                        </div>
                                    )}
                                    <Toggle
                                        checked={prefs.notify_events}
                                        onChange={(v) => setPrefs(p => ({ ...p, notify_events: v }))}
                                        label="Événements"
                                        description="Repas thématiques, animations, fermetures"
                                    />
                                </div>

                                <button
                                    onClick={handleSubscribe}
                                    disabled={isSaving}
                                    className="w-full bg-mariam-blue text-white font-medium py-3 px-4 rounded-xl hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSaving ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <Bell className="h-5 w-5" />
                                    )}
                                    Activer les notifications
                                </button>
                            </div>
                        ) : (
                            /* Abonné - configuration des préférences */
                            <>
                                <InfoCard
                                    icon={<CheckCircle2 className="h-5 w-5" />}
                                    title="Notifications activées"
                                    variant="success"
                                >
                                    <p>Vous recevrez vos notifications selon les paramètres ci-dessous.</p>
                                </InfoCard>

                                <div className="bg-white rounded-xl border border-gray-200 divide-y">
                                    <div className="p-4">
                                        <Toggle
                                            checked={prefs.notify_today_menu}
                                            onChange={(v) => {
                                                const newPrefs = { ...prefs, notify_today_menu: v };
                                                handleSavePrefs(newPrefs);
                                            }}
                                            label="Menu du jour"
                                            description="Notification quotidienne le matin"
                                        />
                                        {prefs.notify_today_menu && (
                                            <div className="pl-4 pb-1">
                                                <TimeSelector
                                                    value={prefs.notify_today_menu_time}
                                                    onChange={(v) => {
                                                        const newPrefs = { ...prefs, notify_today_menu_time: v };
                                                        handleSavePrefs(newPrefs);
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4">
                                        <Toggle
                                            checked={prefs.notify_tomorrow_menu}
                                            onChange={(v) => {
                                                const newPrefs = { ...prefs, notify_tomorrow_menu: v };
                                                handleSavePrefs(newPrefs);
                                            }}
                                            label="Menu du lendemain"
                                            description="Rappel la veille au soir"
                                        />
                                        {prefs.notify_tomorrow_menu && (
                                            <div className="pl-4 pb-1">
                                                <TimeSelector
                                                    value={prefs.notify_tomorrow_menu_time}
                                                    onChange={(v) => {
                                                        const newPrefs = { ...prefs, notify_tomorrow_menu_time: v };
                                                        handleSavePrefs(newPrefs);
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4">
                                        <Toggle
                                            checked={prefs.notify_events}
                                            onChange={(v) => {
                                                const newPrefs = { ...prefs, notify_events: v };
                                                handleSavePrefs(newPrefs);
                                            }}
                                            label="Événements"
                                            description="Repas thématiques, animations, fermetures"
                                        />
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="space-y-3">
                                    <button
                                        onClick={handleTest}
                                        disabled={isTesting}
                                        className="w-full bg-white border border-gray-200 text-gray-700 font-medium py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                                    >
                                        {isTesting ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : testSent ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                                        ) : (
                                            <Send className="h-4 w-4" />
                                        )}
                                        {testSent ? 'Notification envoyée !' : 'Envoyer une notification de test'}
                                    </button>

                                    <button
                                        onClick={handleUnsubscribe}
                                        disabled={isSaving}
                                        className="w-full text-red-600 font-medium py-2.5 px-4 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                                    >
                                        <BellOff className="h-4 w-4" />
                                        Désactiver les notifications
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Suggestion d'installation PWA (si disponible et pas déjà installé) */}
                        {!isInstalled && installPrompt && (
                            <PwaInstallSuggestion onInstall={handleInstallPwa} />
                        )}

                        {/* Note de confidentialité */}
                        <p className="text-xs text-gray-400 text-center px-4">
                            Aucun compte n'est nécessaire. Vos préférences sont liées à cet appareil.
                            Vous pouvez vous désabonner à tout moment.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}

// ========================================
// Type pour l'événement beforeinstallprompt
// ========================================
interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
