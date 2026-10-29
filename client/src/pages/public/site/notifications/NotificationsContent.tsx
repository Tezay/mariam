import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronRight,
  Download,
  Send,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { usePwaInstall } from '@/contexts/PwaInstallContext';
import type { SiteRef } from '@/lib/api/client';
import { detectPlatform, isSafari } from '@/lib/app-install';
import { isPushSupported } from '@/lib/push';
import { BlockedGuide, InstallGuide } from './guides';
import { Notice } from './Notice';
import { panelScreen } from './panel-rules';
import { PreferencesForm } from './PreferencesForm';
import { useNotifications } from './useNotifications';

const PRIMARY =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-site-brand-solid px-4 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50';
const SECONDARY =
  'flex w-full items-center justify-center gap-2 rounded-xl border border-site-line px-4 py-2.5 text-sm font-medium transition-colors hover:bg-site-raised disabled:opacity-50';

const SUGGESTIONS = {
  phone: {
    title: "Ajouter à l'écran d'accueil",
    text: "Pour retrouver ce restaurant d'un geste, ajoutez-le à votre écran d'accueil.",
    done: "Le restaurant a été ajouté à votre écran d'accueil.",
  },
  computer: {
    title: 'Installer sur cet ordinateur',
    text: "Pour retrouver ce restaurant d'un clic, installez-le comme une application.",
    done: 'Le restaurant a été installé sur cet ordinateur.',
  },
};

function InstallSuggestion({
  wording,
  onInstall,
}: {
  wording: (typeof SUGGESTIONS)['phone'];
  onInstall: () => void;
}) {
  return (
    <div className="rounded-2xl border border-site-line bg-site-raised p-4">
      <div className="flex items-start gap-3">
        <Download aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-site-brand" />
        <div className="flex-1">
          <p className="text-sm font-medium">{wording.title}</p>
          <p className="mt-0.5 text-sm text-site-subtle">{wording.text}</p>
          <button
            type="button"
            onClick={onInstall}
            className="mt-2 flex items-center gap-1 text-sm font-medium text-site-brand hover:underline"
          >
            Installer <ChevronRight aria-hidden className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsContent({ site }: { site: SiteRef }) {
  const notifications = useNotifications(site);
  const { installPrompt, isInstalled, triggerInstall } = usePwaInstall();
  const [rechecked, setRechecked] = useState(false);
  const [installNotice, setInstallNotice] = useState<string | null>(null);
  const platform = detectPlatform();
  const screen = panelScreen({
    platform,
    installed: isInstalled,
    secure: window.isSecureContext,
    supported: isPushSupported(),
    permission: notifications.permission,
    subscribed: notifications.subscribed,
  });
  const ready = screen === 'subscribe' || screen === 'subscribed';
  const suggestion = SUGGESTIONS[platform === 'desktop' ? 'computer' : 'phone'];

  const install = async () => {
    if ((await triggerInstall()) === 'accepted') setInstallNotice(suggestion.done);
  };

  return (
    <div className="space-y-5">
      {notifications.error && (
        <div className="flex items-start gap-2 rounded-xl border border-site-danger-line bg-site-danger-soft p-3 text-sm text-site-danger">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notifications.error}</span>
        </div>
      )}
      {(notifications.notice ?? installNotice) && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-site-ok/30 bg-site-ok-soft p-3 text-sm text-site-ok"
        >
          <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notifications.notice ?? installNotice}</span>
        </div>
      )}

      {screen === 'loading' && (
        <div className="flex justify-center py-10">
          <Spinner className="size-8 text-site-brand" />
        </div>
      )}

      {screen === 'install' && <InstallGuide safari={isSafari()} />}

      {screen === 'insecure' && (
        <Notice
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Connexion non sécurisée"
          tone="warning"
        >
          <p>
            Les notifications push nécessitent une connexion sécurisée (HTTPS). En production, ce
            panneau fonctionnera automatiquement.
          </p>
          <p className="mt-2 text-xs opacity-75">
            En développement, accédez via <strong>localhost</strong> au lieu d'une adresse IP.
          </p>
        </Notice>
      )}

      {screen === 'unsupported' && (
        <Notice
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Navigateur non compatible"
          tone="warning"
        >
          Votre navigateur ne supporte pas les notifications push. Essayez avec Chrome (Android) ou
          Safari (iOS 16.4+).
        </Notice>
      )}

      {screen === 'blocked' && (
        <BlockedGuide
          platform={platform}
          stillBlocked={rechecked}
          onRecheck={() => {
            notifications.recheckPermission();
            setRechecked(true);
          }}
        />
      )}

      {screen === 'subscribe' && (
        <div className="space-y-4 rounded-2xl border border-site-line p-5 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-site-brand-soft">
            <Bell aria-hidden className="h-7 w-7 text-site-brand" />
          </span>
          <div>
            <h3 className="text-lg font-semibold">Recevez le menu du jour</h3>
            <p className="mt-1 text-sm text-site-subtle">
              Soyez notifié chaque jour avec le menu du restaurant, directement sur votre téléphone.
            </p>
          </div>
          <div className="border-t border-site-line pt-2 text-left">
            <PreferencesForm prefs={notifications.prefs} onChange={notifications.setPrefs} />
          </div>
          <button
            type="button"
            onClick={notifications.subscribe}
            disabled={notifications.saving}
            className={PRIMARY}
          >
            {notifications.saving ? <Spinner /> : <Bell aria-hidden className="h-5 w-5" />}
            Activer les notifications
          </button>
        </div>
      )}

      {screen === 'subscribed' && (
        <>
          <Notice
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Notifications activées"
            tone="success"
          >
            Vous recevrez vos notifications selon les paramètres ci-dessous.
          </Notice>
          <div className="rounded-2xl border border-site-line px-4">
            <PreferencesForm prefs={notifications.prefs} onChange={notifications.changePrefs} />
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={notifications.sendTest}
              disabled={notifications.testing}
              className={SECONDARY}
            >
              {notifications.testing ? (
                <Spinner />
              ) : notifications.testSent ? (
                <CheckCircle2 aria-hidden className="h-4 w-4 text-site-ok" />
              ) : (
                <Send aria-hidden className="h-4 w-4" />
              )}
              {notifications.testSent
                ? 'Notification envoyée !'
                : 'Envoyer une notification de test'}
            </button>
            <button
              type="button"
              onClick={notifications.unsubscribe}
              disabled={notifications.saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-site-danger transition-colors hover:bg-site-danger-soft disabled:opacity-50"
            >
              <BellOff aria-hidden className="h-4 w-4" />
              Désactiver les notifications
            </button>
          </div>
        </>
      )}

      {ready && !isInstalled && installPrompt && (
        <InstallSuggestion wording={suggestion} onInstall={install} />
      )}

      {ready && (
        <p className="text-center text-xs text-site-subtle">
          Aucun compte n'est nécessaire. Vos préférences sont liées à cet appareil. Vous pouvez vous
          désabonner à tout moment.
        </p>
      )}
    </div>
  );
}
