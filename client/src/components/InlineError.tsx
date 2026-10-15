import { RefreshCw, Home, WifiOff, ServerCrash, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { Link } from 'react-router';
import type { ApiErrorKind } from '@/lib/api/errors';

export interface InlineErrorProps {
  type: ApiErrorKind;
  message?: string;
  onRetry?: () => void;
  showLogo?: boolean;
  compact?: boolean;
}

const errorConfig = {
  network: {
    icon: WifiOff,
    title: 'Connexion impossible',
    description: 'Impossible de se connecter au serveur. Vérifiez votre connexion internet.',
  },
  server: {
    icon: ServerCrash,
    title: 'Erreur serveur',
    description: 'Le serveur rencontre un problème. Veuillez réessayer plus tard.',
  },
  forbidden: {
    icon: Ban,
    title: 'Accès refusé',
    description: "Vous n'avez pas les permissions nécessaires.",
  },
  notfound: {
    icon: WifiOff,
    title: 'Données introuvables',
    description: "Les données demandées n'existent pas ou ont été supprimées.",
  },
  unknown: {
    icon: ServerCrash,
    title: 'Erreur inattendue',
    description: "Une erreur inattendue s'est produite.",
  },
};

export function InlineError({
  type,
  message,
  onRetry,
  showLogo = false,
  compact = false,
}: InlineErrorProps) {
  const config = errorConfig[type];
  const IconComponent = config.icon;

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
        <IconComponent className="mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="mb-3 text-sm text-muted-foreground">{message || config.description}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
            <RefreshCw className="h-3 w-3" />
            Réessayer
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
      {showLogo && (
        <div className="mb-6">
          <Link to="/">
            <Logo className="h-12 w-auto" />
          </Link>
        </div>
      )}

      <IconComponent className="mb-4 h-16 w-16 text-muted-foreground/30" />

      <h2 className="mb-2 text-center text-xl font-semibold text-foreground">{config.title}</h2>

      <p className="mb-6 max-w-md text-center text-muted-foreground">
        {message || config.description}
      </p>

      <div className="flex flex-col items-center gap-3">
        {onRetry && (
          <Button onClick={onRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Réessayer
          </Button>
        )}
        <Link
          to="/menu"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Home className="h-3 w-3" />
          Retour au menu
        </Link>
      </div>
    </div>
  );
}
