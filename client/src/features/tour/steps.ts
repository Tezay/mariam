import type { Step } from 'react-joyride';

export type TourName = 'orientation' | 'catalog' | 'stats';

export interface TourContext {
  mobile: boolean;
  canSeeStats: boolean;
}

/** Preference key that records a finished tour, so it is not replayed. */
export const TOUR_FLAGS: Record<TourName, 'tour_done' | 'tour_catalog_done' | 'tour_stats_done'> = {
  orientation: 'tour_done',
  catalog: 'tour_catalog_done',
  stats: 'tour_stats_done',
};

/**
 * The sidebar is rendered but hidden below the `sidebar:` breakpoint, so a step
 * aiming at it on a phone would spotlight nothing. Each scope scopes its links.
 */
function navLink(path: string, mobile: boolean) {
  return `${mobile ? '[data-tour="nav-mobile"]' : '[data-tour="nav"]'} a[href="${path}"]`;
}

/**
 * Cards and table are both mounted, one hidden by a breakpoint, so a plain
 * selector would hand back the copy the viewport does not show.
 */
function firstVisible(selector: string) {
  return () =>
    Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
      (element) => element.getClientRects().length > 0
    ) ?? null;
}

function orientation(mobile: boolean, canSeeStats: boolean): Step[] {
  const steps: Step[] = [
    {
      target: mobile ? '[data-tour="nav-mobile"]' : '[data-tour="nav"]',
      title: 'Vos espaces de travail',
      content:
        'Tout part d’ici : composer les menus, suivre le service, gérer vos plats et lire vos statistiques.',
      placement: mobile ? 'top' : 'right',
    },
    {
      target: '[data-tour="calendar-new"]',
      title: 'Composer un menu',
      content:
        'Créez le menu d’un jour, ou reprenez celui d’une journée déjà servie pour aller plus vite.',
      placement: 'bottom',
    },
    // The publish toggle lives in the week view, which a phone never opens: it
    // opens on the day view, where the step becomes a plain centred card.
    mobile
      ? {
          target: 'body',
          title: 'Publier',
          content:
            'Un menu reste un brouillon tant que vous ne l’avez pas publié. Une fois publié, il apparaît sur la page consultée par les étudiants.',
          placement: 'center',
        }
      : {
          target: firstVisible('[data-tour="calendar-publish"]'),
          title: 'Publier',
          content:
            'Un menu reste un brouillon tant que vous ne l’avez pas publié. Une fois publié, il apparaît sur la page consultée par les étudiants.',
          placement: 'bottom',
        },
    {
      target: navLink('/admin/service', mobile),
      title: 'Pendant le service',
      content:
        'Un plat vient de manquer ? Signalez la rupture ici, elle s’affiche aussitôt côté étudiants.',
      placement: mobile ? 'top' : 'right',
    },
    {
      target: navLink('/admin/catalogue', mobile),
      title: 'Votre catalogue',
      content:
        'Vos plats réutilisables, avec leur photo, leurs labels et leurs certifications. Composer un menu revient à y piocher.',
      placement: mobile ? 'top' : 'right',
    },
  ];

  // An editor has no statistics entry, so the step would spotlight nothing.
  if (canSeeStats) {
    steps.push({
      target: navLink('/admin/stats', mobile),
      title: 'Ce que ça donne',
      content:
        'Combien d’étudiants consultent le menu, et la note qu’ils lui donnent. Vous voyez rapidement ce qui plaît le plus.',
      placement: mobile ? 'top' : 'right',
    });
  }

  return steps;
}

function catalog(): Step[] {
  return [
    {
      target: '[data-tour="catalog-toolbar"]',
      title: 'Retrouver un plat',
      content: 'Cherchez par nom, filtrez par catégorie, par label ou par certification.',
      placement: 'bottom',
    },
    {
      target: firstVisible('[data-dish-key]'),
      title: 'Une fiche par plat',
      content:
        'Ouvrez un plat pour sa photo, ses labels, sa fréquence de service et la note que lui donnent les étudiants.',
      placement: 'bottom',
    },
  ];
}

function stats(): Step[] {
  return [
    {
      target: '[data-tour="stats-tabs"]',
      title: 'Par où commencer',
      content:
        'Combien de monde a regardé le menu, ce que les étudiants en ont pensé, et si vos menus partent à temps.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="stats-period"]',
      title: 'La période',
      content:
        'Toutes les statistiques en dessous sont basées sur cette fenêtre. Resserrez-la pour voir l’effet d’un changement récent, élargissez-la pour lisser les vacances et les jours creux.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="stats-tabs"]',
      title: 'Les notes des étudiants',
      content:
        'Ils peuvent noter le menu chaque jour. L’onglet Satisfaction en tire un score, et pointe les plats qui le tirent vers le haut ou vers le bas.',
      placement: 'bottom',
    },
  ];
}

export function stepsFor(tour: TourName, { mobile, canSeeStats }: TourContext): Step[] {
  if (tour === 'catalog') return catalog();
  if (tour === 'stats') return stats();
  return orientation(mobile, canSeeStats);
}
