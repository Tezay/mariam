/**
 * 404 - Page Not Found
 */
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft } from 'lucide-react';

export function NotFound() {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
            <div className="mb-8">
                <Link to="/">
                    <Logo className="h-16 w-auto" />
                </Link>
            </div>

            <div className="text-8xl font-bold text-muted-foreground/30 mb-2">
                404
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-3 text-center">
                Page introuvable
            </h1>

            <p className="text-muted-foreground text-center max-w-md mb-8">
                La page que vous recherchez n'existe pas ou a été déplacée.
            </p>

            <div className="flex flex-col items-center gap-3">
                <Button asChild size="lg" className="gap-2">
                    <Link to="/menu">
                        <Home className="w-4 h-4" />
                        Retour au menu
                    </Link>
                </Button>
                <Link
                    to="/admin"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                    <ArrowLeft className="w-3 h-3" />
                    Aller au dashboard
                </Link>
            </div>

            <div className="absolute bottom-6 text-xs text-muted-foreground/50">
                Erreur 404
            </div>
        </div>
    );
}
