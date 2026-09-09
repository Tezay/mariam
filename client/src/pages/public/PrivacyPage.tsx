import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentMeta } from '@/lib/use-document-meta';
import { PublicShell } from './PublicShell';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

function Basis({ children }: { children: React.ReactNode }) {
  return <p className="pt-1 text-xs text-gray-400">{children}</p>;
}

export function PrivacyPage() {
  useDocumentMeta({ title: 'Confidentialité — Mariam' });

  return (
    <PublicShell size="narrow">
      <div className="px-5 py-10">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au menu
        </Link>

        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Confidentialité</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-gray-700">
          Vous consultez le menu sans compte, sans cookie et sans être suivi. Nous comptons les
          visites de façon anonyme. Si vous notez un menu, nous gardons la note, pas votre identité.
          Rien n’est vendu, rien ne sert à la publicité.
        </p>
        <p className="mt-3 text-sm text-gray-500">
          Cette page s’adresse aux visiteurs des pages de menu, qui n’ont pas de compte.
        </p>

        <div className="mt-8 space-y-8">
          <Section title="Ce que nous mesurons">
            <p>
              Nous comptons les consultations des pages de menu, par site, par jour, par heure et
              selon le type de page consultée (menu du jour, semaine, écran d’affichage). Ces
              compteurs sont agrégés et ne contiennent aucune donnée vous concernant. Rien n’est
              déposé sur votre appareil.
            </p>
            <p>
              Pour estimer le nombre de visiteurs distincts, votre adresse IP et votre navigateur
              sont pseudonymisés dès leur réception par un hachage à sens unique, dont la clé est
              renouvelée chaque jour. Ni l’adresse, ni le haché, ni la clé ne sont conservés : ils
              expirent sous 48 heures, et seuls les totaux quotidiens sont enregistrés. Le
              renouvellement quotidien de la clé exclut tout recoupement d’un jour sur l’autre.
            </p>
            <p>
              Ces pages utilisent également Umami, une solution de mesure d’audience que nous
              hébergeons nous-mêmes. Elle ne dépose pas de cookie, ne permet aucun suivi d’un site à
              l’autre et ne transmet aucune donnée à un tiers.
            </p>
            <Basis>
              Base légale : intérêt légitime (mesurer l’usage du service et vérifier son bon
              fonctionnement).
            </Basis>
          </Section>

          <Section title="Si vous notez un menu">
            <p>
              Le vote enregistre votre note, la date, le site, le plat éventuellement désigné et le
              jeu d’icônes présenté. Aucun nom, aucune adresse et aucun compte n’y est associé.
            </p>
            <p>
              Empêcher un même votant de se prononcer plusieurs fois suppose de reconnaître votre
              appareil pendant la journée. Deux éléments le permettent :
            </p>
            <ul className="ml-4 list-disc space-y-2">
              <li>
                <strong className="font-medium text-gray-700">Un identifiant aléatoire</strong>,
                stocké sur votre appareil, qui vous permet de modifier votre vote jusqu’à minuit. Il
                est répliqué dans plusieurs espaces de stockage du navigateur afin de résister à un
                effacement partiel, et retiré du vote dès le lendemain.
              </li>
              <li>
                <strong className="font-medium text-gray-700">
                  Une empreinte technique de votre navigateur
                </strong>{' '}
                (configuration d’affichage, langue, fuseau horaire, capacités matérielles), calculée
                localement au moment du vote et jamais lors d’une simple consultation. Elle est
                produite par une bibliothèque libre s’exécutant dans votre navigateur ; aucun tiers
                ne la reçoit.
              </li>
            </ul>
            <p>
              Transmise par connexion chiffrée, cette empreinte est hachée avec une clé propre à
              votre établissement et renouvelée quotidiennement. Seul le haché est conservé, 48
              heures au maximum, hors de notre base de données. Il n’autorise aucun suivi d’un jour
              ni d’un établissement à l’autre.
            </p>
            <p>
              Les résultats ne sont pas publics : seuls les gestionnaires du restaurant accèdent aux
              moyennes.
            </p>
            <Basis>
              Base légale : intérêt légitime (recueillir un avis fiable). Ces deux éléments ne sont
              mis en œuvre qu’au moment du vote et n’ont aucune autre finalité.
            </Basis>
          </Section>

          <Section title="Ce que nous ne faisons jamais">
            <ul className="ml-4 list-disc space-y-1.5">
              <li>Aucune publicité, aucun profilage, aucune revente.</li>
              <li>Aucun cookie publicitaire, aucun traceur appartenant à un tiers.</li>
              <li>Aucune adresse IP conservée en clair dans notre base de données.</li>
              <li>Aucun transfert de données hors de l’Union européenne.</li>
            </ul>
          </Section>

          <Section title="Durées de conservation">
            <p>
              Les compteurs de visites et les votes sont conservés 13 mois, afin de comparer une
              période à la même période de l’année précédente, puis supprimés automatiquement.
            </p>
            <p>
              Les éléments susceptibles de désigner un appareil ont des durées bien plus courtes :
              48 heures pour l’empreinte de navigateur et les clés quotidiennes, 26 heures pour les
              compteurs anti-abus, et l’identifiant d’appareil est retiré des votes dès le
              lendemain. Nos journaux techniques, tenus pour la sécurité du service, contiennent des
              adresses IP jusqu’à leur rotation.
            </p>
          </Section>

          <Section title="Qui traite ces données">
            <p>
              Eliot Cupillard, éditeur de Mariam, est responsable des traitements décrits sur cette
              page. Vous pouvez le contacter à{' '}
              <a className="text-primary underline" href="mailto:contact@mariam.app">
                contact@mariam.app
              </a>
              .
            </p>
            <p>
              Le service, sa base de données et ses sauvegardes sont hébergés en France par
              Scaleway, qui agit comme sous-traitant.
            </p>
          </Section>

          <Section title="Vos droits">
            <p>
              Le jour même, votre appareil est reconnu : votre vote vous est présenté et reste
              modifiable. Effacer les données du site depuis votre navigateur détache définitivement
              votre appareil de ce vote.
            </p>
            <p>
              Passé ce délai, aucun élément ne relie plus un vote ou une consultation à une personne
              ou à un appareil. Nous sommes donc dans l’impossibilité d’identifier vos données pour
              donner suite à une demande d’accès, de rectification ou d’effacement. Cette
              impossibilité résulte de la conception même du service.
            </p>
            <p>
              Pour toute question, écrivez-nous à{' '}
              <a className="text-primary underline" href="mailto:contact@mariam.app">
                contact@mariam.app
              </a>
              . Vous pouvez également introduire une réclamation auprès de la Commission nationale
              de l’informatique et des libertés (CNIL).
            </p>
          </Section>
        </div>

        <p className="mt-10 border-t border-gray-100 pt-5 text-xs text-gray-400">
          Dernière mise à jour : 7 septembre 2026
        </p>
      </div>
    </PublicShell>
  );
}
