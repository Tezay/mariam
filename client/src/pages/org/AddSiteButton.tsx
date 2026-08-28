import { Plus, Mail } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

const CONTACT_EMAIL = 'contact@mariam.app';

/**
 * Opening a site is a subscription change, so it goes through Mariam rather
 * than a self-service form.
 */
export function AddSiteButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" />
          Ajouter un site
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-sm font-medium text-foreground">Ajouter un site à votre organisation</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          L'ouverture d'un nouveau site est prise en charge par l'équipe Mariam, qui le configure et
          le rattache à votre organisation.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Ajout d’un site')}`}
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <Mail className="h-4 w-4" />
          {CONTACT_EMAIL}
        </a>
      </PopoverContent>
    </Popover>
  );
}
