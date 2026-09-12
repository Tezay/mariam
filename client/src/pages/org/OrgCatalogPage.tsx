import { CatalogView } from '@/features/catalog/CatalogView';
import { PageHeader } from './ui';

export function OrgCatalogPage() {
  return (
    <div>
      <PageHeader title="Catalogue" description="Les plats servis dans votre organisation" />
      <CatalogView scope="org" />
    </div>
  );
}
