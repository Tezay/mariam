import { Link } from 'react-router-dom';
import type { DuplicateDish } from '../duplicate';

export function DuplicateNotice({ duplicate }: { duplicate: DuplicateDish }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-destructive">
      «&nbsp;{duplicate.name}&nbsp;» porte déjà ce nom dans cette catégorie.
      <Link to={`/admin/catalogue/${duplicate.id}`} className="underline">
        Ouvrir ce plat
      </Link>
    </p>
  );
}
