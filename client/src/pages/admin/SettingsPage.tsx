/** One save bar for every tab but Categories, whose changes are saved as they are made. */
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UnsavedChanges } from './settings/UnsavedChanges';
import { useSettingsState } from './settings/useSettingsState';
import { InfosTab } from './settings/InfosTab';
import { HorairesTab } from './settings/HorairesTab';
import { AccessibiliteTab } from './settings/AccessibiliteTab';
import { CategoriesTab } from './settings/CategoriesTab';
import { TagsTab } from './settings/TagsTab';
import { SatisfactionTab } from './settings/SatisfactionTab';
import { CalendriersTab } from './settings/CalendriersTab';
import { Spinner } from '@/components/ui/spinner';

export function SettingsPage() {
  const state = useSettingsState();
  const { isLoading, isSaving, hasChanges, saveAll } = state;

  const [tab, setTab] = useState('infos');

  if (isLoading) {
    return (
      <div className="container-mariam flex justify-center py-8">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="container-mariam max-w-4xl py-6">
      <p className="mb-5 text-sm text-muted-foreground">
        Les réglages de votre restaurant universitaire. Vos préférences personnelles sont dans Mon
        compte.
      </p>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-xl bg-muted p-1">
          <TabsTrigger value="infos" className="shrink-0 rounded-lg text-sm">
            Infos
          </TabsTrigger>
          <TabsTrigger value="horaires" className="shrink-0 rounded-lg text-sm">
            Horaires
          </TabsTrigger>
          <TabsTrigger value="accessibilite" className="shrink-0 rounded-lg text-sm">
            Accessibilité
          </TabsTrigger>
          <TabsTrigger value="categories" className="shrink-0 rounded-lg text-sm">
            Catégories
          </TabsTrigger>
          <TabsTrigger value="tags" className="shrink-0 rounded-lg text-sm">
            Tags & Labels
          </TabsTrigger>
          <TabsTrigger value="satisfaction" className="shrink-0 rounded-lg text-sm">
            Satisfaction
          </TabsTrigger>
          <TabsTrigger value="calendriers" className="shrink-0 rounded-lg text-sm">
            Calendriers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="infos" className="mt-0 space-y-6">
          <InfosTab state={state} />
        </TabsContent>

        <TabsContent value="horaires" className="mt-0">
          <HorairesTab state={state} />
        </TabsContent>

        <TabsContent value="accessibilite" className="mt-0">
          <AccessibiliteTab state={state} />
        </TabsContent>

        <TabsContent value="categories" className="mt-0">
          <CategoriesTab />
        </TabsContent>

        <TabsContent value="tags" className="mt-0 space-y-6">
          <TagsTab state={state} />
        </TabsContent>

        <TabsContent value="satisfaction" className="mt-0">
          <SatisfactionTab state={state} />
        </TabsContent>

        <TabsContent value="calendriers" className="mt-0">
          <CalendriersTab state={state} />
        </TabsContent>
      </Tabs>

      <UnsavedChanges hasChanges={hasChanges} isSaving={isSaving} onSave={saveAll} />
    </div>
  );
}
