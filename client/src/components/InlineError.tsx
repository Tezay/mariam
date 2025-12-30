/**
 * MARIAM - Inline Error Display Component
 * 
 * Composant d'erreur intégrable dans les pages pour afficher
 * les erreurs de manière claire sans redirection.
 */
import { RefreshCw, Home, WifiOff, ServerCrash, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { Link } from 'react-router-dom';

export interface InlineErrorProps {
    /** Type d'erreur pour adapter le message */
    type: 'network' | 'server' | 'forbidden' | 'notfound' | 'unknown';
    /** Message personnalisé (optionnel) */
    message?: string;
    /** Callback pour réessayer */
    onRetry?: () => void;
    /** Afficher le logo */
    showLogo?: boolean;
    /** Mode compact (pour les cards) */
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
        description: 'Vous n\'avez pas les permissions nécessaires.',
    },
    notfound: {
        icon: WifiOff,
        title: 'Données introuvables',
        description: 'Les données demandées n\'existent pas ou ont été supprimées.',
    },
    unknown: {
        icon: ServerCrash,
        title: 'Erreur inattendue',
        description: 'Une erreur inattendue s\'est produite.',
    },
};

/**
 * Détermine le type d'erreur à partir d'une erreur Axios ou autre
 */
export function getErrorType(error: unknown): InlineErrorProps['type'] {
    if (!error) return 'unknown';

    const axiosError = error as { response?: { status?: number }; code?: string };

    // Erreur réseau (pas de réponse)
    if (axiosError.code === 'ERR_NETWORK' || !axiosError.response) {
        return 'network';
    }

    const status = axiosError.response?.status;

    if (status === 403) return 'forbidden';
    if (status === 404) return 'notfound';
    if (status && status >= 500) return 'server';

    return 'unknown';
}

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
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <IconComponent className="w-10 h-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                    {message || config.description}
                </p>
                {onRetry && (
                    <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
                        <RefreshCw className="w-3 h-3" />
                        Réessayer
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center px-4">
            {showLogo && (
                <div className="mb-6">
                    <Link to="/">
                        <Logo className="h-12 w-auto" />
                    </Link>
                </div>
            )}

            <IconComponent className="w-16 h-16 text-muted-foreground/30 mb-4" />

            <h2 className="text-xl font-semibold text-foreground mb-2 text-center">
                {config.title}
            </h2>

            <p className="text-muted-foreground text-center max-w-md mb-6">
                {message || config.description}
            </p>

            <div className="flex flex-col items-center gap-3">
                {onRetry && (
                    <Button onClick={onRetry} className="gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Réessayer
                    </Button>
                )}
                <Link
                    to="/menu"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                    <Home className="w-3 h-3" />
                    Retour au menu
                </Link>
            </div>
        </div>
    );
}
