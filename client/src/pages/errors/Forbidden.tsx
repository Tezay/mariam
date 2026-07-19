/**
 * 403 - Forbidden
 */
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Ban } from 'lucide-react';

export function Forbidden() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8">
        <Link to="/">
          <Logo className="h-16 w-auto" />
        </Link>
      </div>

      <Ban className="mb-4 h-16 w-16 text-muted-foreground/30" />

      <h1 className="mb-3 text-center text-2xl font-bold text-foreground">Accès refusé</h1>

      <p className="mb-8 max-w-md text-center text-muted-foreground">
        Vous n'avez pas les permissions nécessaires pour accéder à cette page.
      </p>

      <div className="flex flex-col items-center gap-3">
        <Button asChild size="lg" className="gap-2">
          <Link to="/admin">
            <ArrowLeft className="h-4 w-4" />
            Retour au dashboard
          </Link>
        </Button>
      </div>

      <div className="absolute bottom-6 text-xs text-muted-foreground/50">Erreur 403</div>
    </div>
  );
}
