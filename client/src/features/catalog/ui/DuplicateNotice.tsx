import { Link } from 'react-router';
import type { DuplicateDish } from '../duplicate';
import { useSitePage } from '@/contexts/SiteContext';

export function DuplicateNotice({ duplicate }: { duplicate: DuplicateDish }) {
  const sitePage = useSitePage();
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-destructive">
      «&nbsp;{duplicate.name}&nbsp;» porte déjà ce nom dans cette catégorie.
      <Link to={sitePage(`/catalogue/${duplicate.id}`)} className="underline">
        Ouvrir ce plat
      </Link>
    </p>
  );
}
