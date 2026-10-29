import { BellOff, Ellipsis, Plus, Share, Smartphone } from 'lucide-react';
import type { Platform } from '@/lib/app-install';
import { cn } from '@/lib/utils';
import { Notice } from './Notice';

function Step({
  number,
  title,
  done,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-4 p-4">
      <span
        aria-hidden
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
          done ? 'bg-site-ok' : 'bg-site-brand-solid'
        )}
      >
        {number}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-site-subtle">{children}</p>
      </div>
    </li>
  );
}

export function InstallGuide({ safari }: { safari: boolean }) {
  return (
    <div className="space-y-4">
      <Notice
        icon={<Smartphone className="h-5 w-5" />}
        title="Installation requise sur iPhone / iPad"
        tone="warning"
      >
        Sur iOS, les notifications ne fonctionnent qu'après avoir ajouté ce restaurant à votre écran
        d'accueil{safari ? ' :' : '.'}
        {!safari && (
          <>
            {' '}
            Ouvrez d'abord cette page dans <strong>Safari</strong>, puis :
          </>
        )}
      </Notice>
      <ol className="divide-y divide-site-line rounded-2xl border border-site-line">
        <Step number={1} title="Appuyez sur Partager">
          Dans Safari, appuyez sur <Ellipsis className="-mt-0.5 inline h-4 w-4" /> à côté de
          l'adresse, puis sur <Share className="-mt-0.5 inline h-4 w-4" /> <strong>Partager</strong>
          .
        </Step>
        <Step number={2} title="« Sur l'écran d'accueil »">
          Faites défiler les options et appuyez sur <Plus className="-mt-0.5 inline h-4 w-4" />{' '}
          <strong>Sur l'écran d'accueil</strong>.
        </Step>
        <Step number={3} title="Confirmez « Ajouter »">
          Appuyez sur <strong>Ajouter</strong>. L'icône du restaurant apparaît sur votre écran
          d'accueil.
        </Step>
        <Step number={4} title="Ouvrez-la depuis l'écran d'accueil" done>
          Elle s'ouvre sur ce restaurant, et ce panneau vous y attend pour activer les
          notifications.
        </Step>
      </ol>
    </div>
  );
}

const UNBLOCK: Record<Platform, React.ReactNode> = {
  ios: (
    <>
      Ouvrez <strong>Réglages</strong>, puis <strong>Notifications</strong>, choisissez
      l'application du restaurant et activez <strong>Autoriser les notifications</strong>.
    </>
  ),
  android: (
    <>
      Touchez l'icône à gauche de l'adresse (cadenas ou réglages), puis{' '}
      <strong>Autorisations</strong> et <strong>Notifications</strong>, et choisissez{' '}
      <strong>Autoriser</strong>. Si le restaurant est installé sur votre écran d'accueil : appui
      long sur son icône, puis <strong>Infos sur l'appli</strong> et <strong>Notifications</strong>.
    </>
  ),
  desktop: (
    <>
      Cliquez sur l'icône à gauche de l'adresse (cadenas ou réglages) et autorisez les notifications
      pour ce site. Sur Safari : menu <strong>Safari</strong>, puis <strong>Réglages</strong>,{' '}
      <strong>Sites web</strong> et <strong>Notifications</strong>.
    </>
  ),
};

export function BlockedGuide({
  platform,
  onRecheck,
  stillBlocked,
}: {
  platform: Platform;
  onRecheck: () => void;
  stillBlocked: boolean;
}) {
  return (
    <div className="space-y-4">
      <Notice icon={<BellOff className="h-5 w-5" />} title="Notifications bloquées" tone="warning">
        Les notifications de ce site ont été refusées sur cet appareil. Pour les recevoir,
        autorisez-les de nouveau :
      </Notice>
      <p className="rounded-2xl border border-site-line p-4 text-sm leading-relaxed">
        {UNBLOCK[platform]}
      </p>
      <button
        type="button"
        onClick={onRecheck}
        className="flex w-full items-center justify-center rounded-xl bg-site-brand-solid px-4 py-3 font-medium text-white transition-opacity hover:opacity-90"
      >
        J'ai réactivé
      </button>
      {stillBlocked && (
        <p className="text-center text-sm text-site-subtle">
          Elles sont toujours bloquées. Si vous venez de les autoriser, rechargez la page.
        </p>
      )}
    </div>
  );
}
