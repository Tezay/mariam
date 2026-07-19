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
import { usePwaInstall } from '@/contexts/PwaInstallContext';
import { Logo } from '@/components/Logo';
import {
  Bell,
  BellOff,
  ArrowLeft,
  ChevronRight,
  Clock,
  Smartphone,
  Download,
  CheckCircle2,
  AlertTriangle,
  Send,
  Loader2,
  Share,
  Plus,
} from 'lucide-react';
import {
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
} from '@/lib/push';

// ========================================
// Composants internes
// ========================================

/** Toggle switch réutilisable */
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="group flex cursor-pointer items-center justify-between py-3">
      <div className="flex-1 pr-4">
        <p className="font-medium text-gray-900">{label}</p>
        {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-mariam-blue focus:ring-offset-2 ${
          checked ? 'bg-mariam-blue' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

/** Sélecteur d'heure simplifié (HH:MM) */
function TimeSelector({
  value,
  onChange,
  disabled,
}: {
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
        className="rounded-lg border px-3 py-1.5 text-sm text-gray-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-mariam-blue disabled:bg-gray-100 disabled:opacity-50"
      />
    </div>
  );
}

/** Carte d'information avec icône */
function InfoCard({
  icon,
  title,
  children,
  variant = 'info',
}: {
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
          <p className="text-sm font-semibold">{title}</p>
          <div className="mt-1 text-sm opacity-90">{children}</div>
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
          Sur iOS, les notifications ne fonctionnent qu'après avoir ajouté Mariam à votre écran
          d'accueil. C'est rapide (30 secondes) :
        </p>
      </InfoCard>

      <div className="divide-y rounded-xl border border-gray-200 bg-white">
        <div className="flex items-start gap-4 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mariam-blue text-sm font-bold text-white">
            1
          </div>
          <div>
            <p className="font-medium text-gray-900">Appuyez sur le bouton Partager</p>
            <p className="mt-0.5 text-sm text-gray-500">
              En bas de Safari, appuyez sur l'icône <Share className="-mt-0.5 inline h-4 w-4" />{' '}
              (carré avec une flèche vers le haut).
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mariam-blue text-sm font-bold text-white">
            2
          </div>
          <div>
            <p className="font-medium text-gray-900">« Sur l'écran d'accueil »</p>
            <p className="mt-0.5 text-sm text-gray-500">
              Faites défiler les options et appuyez sur <Plus className="-mt-0.5 inline h-4 w-4" />{' '}
              <strong>Sur l'écran d'accueil</strong>.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mariam-blue text-sm font-bold text-white">
            3
          </div>
          <div>
            <p className="font-medium text-gray-900">Confirmez « Ajouter »</p>
            <p className="mt-0.5 text-sm text-gray-500">
              Appuyez sur <strong>Ajouter</strong> en haut à droite. L'icône Mariam apparaît sur
              votre écran d'accueil.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
            4
          </div>
          <div>
            <p className="font-medium text-gray-900">Ouvrez Mariam depuis l'écran d'accueil</p>
            <p className="mt-0.5 text-sm text-gray-500">
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
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 h-5 w-5 shrink-0 text-mariam-blue" />
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">Ajouter à l'écran d'accueil</p>
          <p className="mt-0.5 text-sm text-gray-500">
            Pour un accès rapide, vous pouvez ajouter Mariam à votre écran d'accueil.
          </p>
          <button
            onClick={onInstall}
            className="mt-2 flex items-center gap-1 text-sm font-medium text-mariam-blue hover:underline"
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
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Préférences
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  // PWA install prompt (Android/Desktop) — via contexte global
  const { installPrompt, isInstalled, triggerInstall: triggerPwaInstall } = usePwaInstall();

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
      window.umami?.track('notifications-subscribe');
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
      window.umami?.track('notifications-unsubscribe');
    } else {
      setError(result.error || 'Erreur inconnue');
    }
  }, []);

  const handleSavePrefs = useCallback(
    async (newPrefs: NotificationPreferences) => {
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
    },
    [isSubscribed]
  );

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
    const outcome = await triggerPwaInstall();
    if (outcome === 'accepted') {
      setSuccessMessage("Mariam a été ajouté à votre écran d'accueil");
    }
  }, [triggerPwaInstall]);

  // ========================================
  // Conditions de blocage
  // ========================================

  const needsPwa = requiresPwaForPush(); // iOS non-PWA -> doit installer en premier
  const isSecure = window.isSecureContext; // HTTP non-localhost -> SW indisponible
  const pushSupported = isPushSupported(); // Vérifié seulement si contexte sécurisé

  // ========================================
  // Rendu
  // ========================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="flex items-center gap-3 bg-mariam-blue p-4 text-white">
        <button
          onClick={() => navigate('/menu')}
          className="rounded-lg p-1 transition-colors hover:bg-white/10"
          aria-label="Retour au menu"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Logo className="h-8 w-auto" variant="light" />
        <span className="flex-1 text-sm font-medium">Notifications</span>
      </header>

      <main className="mx-auto max-w-lg space-y-6 p-4 pb-8">
        {/* Messages de statut */}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
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
              Les notifications push nécessitent une connexion sécurisée (HTTPS). En production,
              cette page fonctionnera automatiquement.
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
              Votre navigateur ne supporte pas les notifications push. Essayez avec Chrome (Android)
              ou Safari (iOS 16.4+).
            </p>
          </InfoCard>
        ) : (
          /* Interface de configuration des notifications */
          <div className="space-y-6">
            {/* Activation principale */}
            {!isSubscribed ? (
              <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                  <Bell className="h-8 w-8 text-mariam-blue" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Recevez le menu du jour</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Soyez notifié chaque jour avec le menu du restaurant, directement sur votre
                    téléphone.
                  </p>
                </div>

                {/* Préférences pré-activation */}
                <div className="space-y-1 border-t pt-4 text-left">
                  <Toggle
                    checked={prefs.notify_today_menu}
                    onChange={(v) => setPrefs((p) => ({ ...p, notify_today_menu: v }))}
                    label="Menu du jour"
                    description="Notification quotidienne le matin"
                  />
                  {prefs.notify_today_menu && (
                    <div className="pb-2 pl-4">
                      <TimeSelector
                        value={prefs.notify_today_menu_time}
                        onChange={(v) =>
                          setPrefs((p) => ({
                            ...p,
                            notify_today_menu_time: v,
                          }))
                        }
                      />
                    </div>
                  )}
                  <Toggle
                    checked={prefs.notify_tomorrow_menu}
                    onChange={(v) => setPrefs((p) => ({ ...p, notify_tomorrow_menu: v }))}
                    label="Menu du lendemain"
                    description="Rappel la veille au soir"
                  />
                  {prefs.notify_tomorrow_menu && (
                    <div className="pb-2 pl-4">
                      <TimeSelector
                        value={prefs.notify_tomorrow_menu_time}
                        onChange={(v) =>
                          setPrefs((p) => ({
                            ...p,
                            notify_tomorrow_menu_time: v,
                          }))
                        }
                      />
                    </div>
                  )}
                  <Toggle
                    checked={prefs.notify_events}
                    onChange={(v) => setPrefs((p) => ({ ...p, notify_events: v }))}
                    label="Événements"
                    description="Repas thématiques, animations, fermetures"
                  />
                </div>

                <button
                  onClick={handleSubscribe}
                  disabled={isSaving}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-mariam-blue px-4 py-3 font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
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

                <div className="divide-y rounded-xl border border-gray-200 bg-white">
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
                      <div className="pb-1 pl-4">
                        <TimeSelector
                          value={prefs.notify_today_menu_time}
                          onChange={(v) => {
                            const newPrefs = {
                              ...prefs,
                              notify_today_menu_time: v,
                            };
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
                        const newPrefs = {
                          ...prefs,
                          notify_tomorrow_menu: v,
                        };
                        handleSavePrefs(newPrefs);
                      }}
                      label="Menu du lendemain"
                      description="Rappel la veille au soir"
                    />
                    {prefs.notify_tomorrow_menu && (
                      <div className="pb-1 pl-4">
                        <TimeSelector
                          value={prefs.notify_tomorrow_menu_time}
                          onChange={(v) => {
                            const newPrefs = {
                              ...prefs,
                              notify_tomorrow_menu_time: v,
                            };
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    <BellOff className="h-4 w-4" />
                    Désactiver les notifications
                  </button>
                </div>
              </>
            )}

            {/* Suggestion d'installation PWA (si disponible et pas déjà installé) */}
            {!isInstalled && installPrompt && <PwaInstallSuggestion onInstall={handleInstallPwa} />}

            {/* Note de confidentialité */}
            <p className="px-4 text-center text-xs text-gray-400">
              Aucun compte n'est nécessaire. Vos préférences sont liées à cet appareil. Vous pouvez
              vous désabonner à tout moment.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
