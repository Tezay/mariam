/**
 * Site-level statistics. Renders the same analytics views as the supervision
 * dashboard; the API scopes them to the caller's own site, so nothing here
 * needs to know whether the organization has one site or thirty.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PublicationsView } from '@/features/analytics/PublicationsView';
import { TrafficView } from '@/features/analytics/TrafficView';

export function StatsPage() {
  return (
    <div className="container-mariam py-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Statistiques</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suivez la fréquentation de vos pages et la publication de vos menus.
        </p>
      </div>

      <Tabs defaultValue="traffic">
        <TabsList>
          <TabsTrigger value="traffic">Consultations du menu</TabsTrigger>
          <TabsTrigger value="publications">Publications</TabsTrigger>
        </TabsList>
        <TabsContent value="traffic" className="mt-6">
          <TrafficView />
        </TabsContent>
        <TabsContent value="publications" className="mt-6">
          <PublicationsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
