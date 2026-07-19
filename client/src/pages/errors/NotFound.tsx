/**
 * 404 - Page Not Found
 */
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8">
        <Link to="/">
          <Logo className="h-16 w-auto" />
        </Link>
      </div>

      <div className="mb-2 text-8xl font-bold text-muted-foreground/30">404</div>

      <h1 className="mb-3 text-center text-2xl font-bold text-foreground">Page introuvable</h1>

      <p className="mb-8 max-w-md text-center text-muted-foreground">
        La page que vous recherchez n'existe pas ou a été déplacée.
      </p>

      <div className="flex flex-col items-center gap-3">
        <Button asChild size="lg" className="gap-2">
          <Link to="/menu">
            <Home className="h-4 w-4" />
            Retour au menu
          </Link>
        </Button>
        <Link
          to="/admin"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Aller au dashboard
        </Link>
      </div>

      <div className="absolute bottom-6 text-xs text-muted-foreground/50">Erreur 404</div>
    </div>
  );
}
