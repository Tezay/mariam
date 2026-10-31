import { Link } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { publicPagePath } from '@/lib/public-page';
import { MENU_DAYS_MAX, SERVICES, TEXT_MAX } from '@/lib/site-profile';
import { UnsavedChanges } from './settings/UnsavedChanges';
import { CountedField } from './public-page/CountedField';
import { DeclarationsField } from './public-page/DeclarationsField';
import { GalleryField } from './public-page/GalleryField';
import { LinksField } from './public-page/LinksField';
import { MediaField } from './public-page/MediaField';
import { usePublicPageState } from './public-page/usePublicPageState';

function DaysField({
  id,
  label,
  help,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          const days = Math.round(Number(event.target.value));
          onChange(Number.isNaN(days) ? 0 : Math.min(max, Math.max(0, days)));
        }}
        className="w-28"
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {help}
      </p>
    </div>
  );
}

export function PublicPagePage() {
  const state = usePublicPageState();
  const { site, form, update, images, busyMedia } = state;

  if (state.isLoading) {
    return (
      <div className="container-mariam flex justify-center py-8">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="container-mariam max-w-4xl py-6 text-sm text-muted-foreground">
        La page n'a pas pu être chargée. Rechargez pour réessayer.
      </div>
    );
  }

  return (
    <div className="container-mariam max-w-4xl space-y-6 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Ce que les étudiants découvrent de votre restaurant en ligne. L'adresse, les horaires, les
          paiements et l'accessibilité se règlent dans{' '}
          <Link to="/admin/settings" className="text-primary underline-offset-4 hover:underline">
            Mon restaurant
          </Link>
          .
        </p>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <a href={publicPagePath(site.site)} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            Voir la page
          </a>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Présentation</CardTitle>
          <CardDescription>Les premiers mots qu'on lit de votre restaurant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CountedField
            id="tagline"
            label="Accroche"
            help="Une phrase affichée sous le nom du restaurant et dans les résultats de recherche."
            value={form.tagline}
            max={TEXT_MAX.tagline}
            onChange={(tagline) => update({ tagline })}
          />
          <CountedField
            id="description"
            label="Présentation"
            help="Quelques lignes pour présenter le restaurant à ceux qui ne le connaissent pas. Laissez une ligne vide entre deux paragraphes."
            value={form.description}
            max={TEXT_MAX.description}
            rows={5}
            onChange={(description) => update({ description })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
          <CardDescription>Chaque image est enregistrée dès son envoi.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <MediaField
            label="Logo"
            help="Affiché à côté du nom. Un format carré rend le mieux ; un fond transparent est gardé."
            url={images.logo}
            shape="square"
            busy={busyMedia === 'logo'}
            removeTitle="Retirer le logo ?"
            onPick={(file) => state.putMedia('logo', file)}
            onRemove={() => state.deleteMedia('logo')}
          />
          <MediaField
            label="Photo de couverture"
            help="La grande image en haut de votre page, reprise quand le lien est partagé. Choisissez une photo en paysage."
            url={images.cover}
            shape="wide"
            busy={busyMedia === 'cover'}
            removeTitle="Retirer la photo de couverture ?"
            onPick={(file) => state.putMedia('cover', file)}
            onRemove={() => state.deleteMedia('cover')}
          />
          <GalleryField state={state} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Venir et sur place</CardTitle>
          <CardDescription>Ce qui aide à trouver le restaurant et à s'y installer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CountedField
            id="access-info"
            label="Accès et transports"
            help="Métro, bus, stationnement vélo : comment venir."
            value={form.accessInfo}
            max={TEXT_MAX.accessInfo}
            rows={3}
            onChange={(accessInfo) => update({ accessInfo })}
          />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Services sur place</legend>
            <p className="text-xs text-muted-foreground">Cochez ce que le restaurant propose.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SERVICES.map(({ id, label, icon: Icon }) => (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 text-sm transition-colors hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={form.services.includes(id)}
                    onChange={(event) =>
                      update({
                        services: event.target.checked
                          ? [...form.services, id]
                          : form.services.filter((service) => service !== id),
                      })
                    }
                    className="rounded"
                  />
                  <Icon aria-hidden className="h-4 w-4 text-muted-foreground" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liens utiles</CardTitle>
          <CardDescription>Ils s'ouvrent dans un nouvel onglet depuis la page.</CardDescription>
        </CardHeader>
        <CardContent>
          <LinksField state={state} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qualité des produits</CardTitle>
          <CardDescription>
            Ce que vous achetez et cuisinez. La page publique calcule seule la part des plats faits
            maison, locaux, de saison et labellisés, à partir de vos menus publiés.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DeclarationsField />
          <CountedField
            id="quality-commitments"
            label="Nos engagements"
            help="Ce que l'équipe fait pour la qualité : producteurs, cuisine sur place, gaspillage, commerce équitable…"
            value={form.qualityCommitments}
            max={TEXT_MAX.qualityCommitments}
            rows={4}
            onChange={(qualityCommitments) => update({ qualityCommitments })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Menus en ligne</CardTitle>
          <CardDescription>
            Jusqu'où les visiteurs remontent et anticipent vos menus publiés.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <DaysField
            id="menu-days-ahead"
            label="Jours à venir"
            help="Les menus publiés sont visibles en ligne jusqu'à ce nombre de jours à l'avance. 0 : seulement le menu du jour."
            value={form.menuDaysAhead}
            max={MENU_DAYS_MAX.ahead}
            onChange={(menuDaysAhead) => update({ menuDaysAhead })}
          />
          <DaysField
            id="menu-days-back"
            label="Historique"
            help="Les menus passés restent consultables pendant ce nombre de jours. 0 : aucun historique."
            value={form.menuDaysBack}
            max={MENU_DAYS_MAX.back}
            onChange={(menuDaysBack) => update({ menuDaysBack })}
          />
        </CardContent>
      </Card>

      <UnsavedChanges hasChanges={state.hasChanges} isSaving={state.isSaving} onSave={state.save} />
    </div>
  );
}
