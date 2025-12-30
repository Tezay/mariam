/**
 * 403 - Forbidden
 */
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Ban } from 'lucide-react';

export function Forbidden() {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
            <div className="mb-8">
                <Link to="/">
                    <Logo className="h-16 w-auto" />
                </Link>
            </div>

            <Ban className="w-16 h-16 text-muted-foreground/30 mb-4" />

            <h1 className="text-2xl font-bold text-foreground mb-3 text-center">
                Accès refusé
            </h1>

            <p className="text-muted-foreground text-center max-w-md mb-8">
                Vous n'avez pas les permissions nécessaires pour accéder à cette page.
            </p>

            <div className="flex flex-col items-center gap-3">
                <Button asChild size="lg" className="gap-2">
                    <Link to="/admin">
                        <ArrowLeft className="w-4 h-4" />
                        Retour au dashboard
                    </Link>
                </Button>
            </div>

            <div className="absolute bottom-6 text-xs text-muted-foreground/50">
                Erreur 403
            </div>
        </div>
    );
}
