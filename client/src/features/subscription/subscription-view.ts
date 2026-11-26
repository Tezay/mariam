/**
 * What a site's subscription page says, from the standing the API computes.
 * Dates are calendar days, never instants: they are read and drawn at noon UTC.
 */
import { addDays } from '@/lib/date-utils';
import type {
  Subscription,
  SubscriptionPeriod,
  SubscriptionSummary,
} from '@/lib/api/subscriptions';

export type Tone = 'trial' | 'active' | 'soon' | 'expired' | 'muted';

export interface Badge {
  label: string;
  tone: Tone;
}

const SOON_DAYS = 30;
const TRIAL_BANNER_DAYS = 7;
const DRAWN_RECONDUCTIONS = 4;

const DAY = 86_400_000;
const LONG = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function noon(iso: string): number {
  return Date.parse(`${iso}T12:00:00Z`);
}

export function longDate(iso: string): string {
  return LONG.format(noon(iso)).replace(/^1 /, '1er ');
}

/** The server's `add_years`: 29 February falls back to the 28th. */
export function addYears(iso: string, years: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const moved = new Date(Date.UTC(year + years, month - 1, day, 12));
  if (moved.getUTCMonth() !== month - 1) moved.setUTCDate(0);
  return moved.toISOString().slice(0, 10);
}

export function kindLabel(kind: SubscriptionPeriod['kind']): string {
  return { trial: 'Essai gratuit', paid: 'Abonnement', complimentary: 'Période offerte' }[kind];
}

export function isEndNear(standing: SubscriptionSummary): boolean {
  return (
    standing.state === 'active' &&
    standing.end !== 'covered' &&
    standing.days_left !== null &&
    standing.days_left <= SOON_DAYS
  );
}

export function statusBadge(standing: SubscriptionSummary): Badge {
  switch (standing.state) {
    case 'disabled':
      return { label: 'Site désactivé', tone: 'muted' };
    case 'expired':
      return { label: 'Arrivé à échéance', tone: 'expired' };
    case 'upcoming':
      return { label: 'À venir', tone: 'muted' };
    case 'none':
      return { label: 'Aucun abonnement', tone: 'muted' };
  }
  if (standing.current?.kind === 'trial') return { label: 'Essai gratuit', tone: 'trial' };
  if (isEndNear(standing)) return { label: 'Échéance proche', tone: 'soon' };
  if (standing.current?.kind === 'complimentary') {
    return { label: 'Période offerte', tone: 'active' };
  }
  return { label: 'Abonnement actif', tone: 'active' };
}

/**
 * A site's one badge in the supervisor's views: the subscription shows only when there is
 * something to know.
 */
export function siteBadge(siteActive: boolean, standing?: SubscriptionSummary): Badge {
  if (!siteActive) return { label: 'Inactif', tone: 'muted' };
  if (standing) {
    const badge = statusBadge(standing);
    if (['trial', 'soon', 'expired'].includes(badge.tone) || standing.state === 'upcoming') {
      return badge;
    }
  }
  return { label: 'Actif', tone: 'active' };
}

export function siteBadgeTitle(standing?: SubscriptionSummary): string | undefined {
  if (standing?.state === 'active' && standing.current) {
    return `${kindLabel(standing.current.kind)} jusqu'au ${longDate(standing.current.ends_on)}`;
  }
  if (standing?.state === 'upcoming' && standing.next) {
    return `${kindLabel(standing.next.kind)} à partir du ${longDate(standing.next.starts_on)}`;
  }
  return undefined;
}

function daysLeftLabel(days: number): string {
  if (days === 0) return 'Dernier jour';
  return `${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}`;
}

export interface Headline {
  title: string;
  detail: string | null;
}

export function headline(subscription: Subscription): Headline {
  const { state, current, next, past, days_left: daysLeft } = subscription;
  if (state === 'disabled') {
    return {
      title: 'Site désactivé',
      detail:
        "Sa page publique n'est plus accessible et ses données ne peuvent plus être modifiées. " +
        'Elles restent consultables. Pour le réactiver ou obtenir une copie de vos données, ' +
        'écrivez au support.',
    };
  }
  if (state === 'expired') {
    return {
      title: past.length
        ? `Arrivé à échéance le ${longDate(past[0].ends_on)}`
        : 'Arrivé à échéance',
      detail: 'Le service continue en attendant votre renouvellement.',
    };
  }
  if (state === 'upcoming' && next) {
    return {
      title: `${kindLabel(next.kind)} à partir du ${longDate(next.starts_on)}`,
      detail: null,
    };
  }
  if (!current) return { title: 'Aucun abonnement enregistré', detail: null };
  if (current.kind === 'trial') {
    return {
      title: `Essai gratuit jusqu'au ${longDate(current.ends_on)}`,
      detail: daysLeft === null ? null : daysLeftLabel(daysLeft),
    };
  }
  return {
    title: `Actif jusqu'au ${longDate(current.ends_on)}`,
    detail: daysLeft !== null && isEndNear(subscription) ? daysLeftLabel(daysLeft) : null,
  };
}

/** The dashboard banner's line while the renewal is to decide and the end is near, or past. */
export function subscriptionBanner(subscription: Subscription): string | null {
  const { state, current, past, days_left: daysLeft } = subscription;
  if (state === 'expired' && past.length) {
    return (
      `L'abonnement de ce site est arrivé à échéance le ${longDate(past[0].ends_on)}. ` +
      'Le service continue.'
    );
  }
  if (!canRequestRenewal(subscription) || !current || daysLeft === null) return null;
  const trial = current.kind === 'trial';
  if (daysLeft > (trial ? TRIAL_BANNER_DAYS : SOON_DAYS)) return null;
  return trial
    ? `L'essai gratuit de ce site se termine le ${longDate(current.ends_on)}.`
    : `L'abonnement de ce site se termine le ${longDate(current.ends_on)}.`;
}

export interface Span {
  starts_on: string;
  ends_on: string;
}

function earlier(a: string, b: string): string {
  return a < b ? a : b;
}

/** The next period, when it starts the day after the current one. */
function following(standing: SubscriptionSummary): SubscriptionPeriod | null {
  const { current, next } = standing;
  return current && next?.starts_on === addDays(current.ends_on, 1) ? next : null;
}

/** The years a tacit renewal adds after the current period, as the server derives them. */
function reconductions(standing: SubscriptionSummary): Span[] {
  const { current, next } = standing;
  if (!current || current.renewal !== 'tacit' || !current.tacit_until) return [];
  const limit = next
    ? earlier(current.tacit_until, addDays(next.starts_on, -1))
    : current.tacit_until;
  const spans: Span[] = [];
  let start = addDays(current.ends_on, 1);
  while (start <= limit && spans.length < DRAWN_RECONDUCTIONS) {
    const end = earlier(addDays(addYears(start, 1), -1), limit);
    spans.push({ starts_on: start, ends_on: end });
    start = addDays(end, 1);
  }
  return spans;
}

export function nextReconduction(standing: SubscriptionSummary): Span | null {
  return reconductions(standing)[0] ?? null;
}

export type FactKind =
  'reconduction' | 'notice' | 'horizon' | 'renewed' | 'ending' | 'data' | 'undecided';

export interface Fact {
  kind: FactKind;
  text: string;
}

/** What follows the current period, one fact a line. */
export function renewalFacts(standing: SubscriptionSummary, today: string): Fact[] {
  const { current, end } = standing;
  if (standing.state !== 'active' || !current) return [];
  if (end === 'ending') {
    return [
      { kind: 'ending', text: `Fin du service prévue le ${longDate(current.ends_on)}.` },
      { kind: 'data', text: 'Une copie de vos données peut vous être remise sur demande.' },
    ];
  }
  if (end === 'undecided') {
    return [
      {
        kind: 'undecided',
        text:
          current.kind === 'trial'
            ? "Pour continuer après l'essai, demandez un devis."
            : 'Renouvellement à décider : pour continuer après cette période, demandez un devis.',
      },
    ];
  }
  const next = following(standing);
  if (next) {
    return [
      {
        kind: 'renewed',
        text:
          `Renouvelé : prochaine période du ${longDate(next.starts_on)} ` +
          `au ${longDate(next.ends_on)}.`,
      },
    ];
  }
  const reconduction = nextReconduction(standing);
  if (!reconduction || !current.tacit_until) return [];
  const last = reconduction.ends_on === current.tacit_until;
  const facts: Fact[] = [
    {
      kind: 'reconduction',
      text:
        `Reconduction tacite le ${longDate(reconduction.starts_on)}, ` +
        `jusqu'au ${longDate(reconduction.ends_on)}${last ? ', la dernière prévue au contrat' : ''}.`,
    },
  ];
  if (current.notice_by && current.notice_by >= today) {
    facts.push({
      kind: 'notice',
      text:
        `Pour ne pas reconduire : décision à nous notifier au plus tard le ` +
        `${longDate(current.notice_by)}, selon les modalités du contrat.`,
    });
  }
  if (!last) {
    facts.push({
      kind: 'horizon',
      text: `Reconductions possibles jusqu'au ${longDate(current.tacit_until)}.`,
    });
  }
  return facts;
}

export function canRequestRenewal(standing: SubscriptionSummary): boolean {
  return (
    standing.state === 'expired' || (standing.state === 'active' && standing.end === 'undecided')
  );
}

export interface Segment extends Span {
  kind: 'current' | 'reconduction' | 'next';
  days: number;
  label: string;
}

export interface ContractTimeline {
  segments: Segment[];
  /** Share of the current period gone by, from 0 to 1. */
  elapsed: number;
  /** Where the last day to decline the reconduction falls in the current period. */
  notice: number | null;
}

function length(span: Span): number {
  return Math.round((noon(span.ends_on) - noon(span.starts_on)) / DAY) + 1;
}

function share(span: Span, day: string): number {
  return Math.min(
    1,
    Math.max(0, (noon(day) - noon(span.starts_on) + DAY / 2) / (length(span) * DAY))
  );
}

function segment(span: Span, kind: Segment['kind']): Segment {
  const from = span.starts_on.slice(0, 4);
  const to = span.ends_on.slice(0, 4);
  return {
    starts_on: span.starts_on,
    ends_on: span.ends_on,
    kind,
    days: length(span),
    label: from === to ? from : `${from}-${to}`,
  };
}

export function contractTimeline(
  standing: SubscriptionSummary,
  today: string
): ContractTimeline | null {
  const { current, end } = standing;
  if (!current) return null;
  const segments = [segment(current, 'current')];
  const next = following(standing);
  if (next) {
    segments.push(segment(next, 'next'));
  } else if (end === 'covered') {
    segments.push(...reconductions(standing).map((span) => segment(span, 'reconduction')));
  }
  const noticeBy = current.notice_by;
  const declinable =
    noticeBy !== null && noticeBy >= today && segments.some((part) => part.kind === 'reconduction');
  return {
    segments,
    elapsed: share(current, today),
    notice: declinable ? share(current, noticeBy) : null,
  };
}

export function formatSiret(siret: string): string {
  return siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4');
}

export interface SupportContext {
  organization: string;
  site: string;
  path: string;
}

export interface Reference {
  label: string;
  value: string;
  copyable?: boolean;
  billing?: boolean;
}

/** What identifies the site and its period, in the order the support reads it. */
export function references(standing: SubscriptionSummary, context: SupportContext): Reference[] {
  const period = standing.current ?? standing.next;
  const rows: (Omit<Reference, 'value'> & { value: string | null | undefined })[] = [
    { label: 'Organisation', value: context.organization },
    { label: 'Site', value: `${context.site} (${context.path})` },
    {
      label: 'Période',
      value: period
        ? `${kindLabel(period.kind)} du ${longDate(period.starts_on)} au ${longDate(period.ends_on)}`
        : statusBadge(standing).label,
    },
    { label: 'Devis', value: period?.quote_ref, copyable: true },
    { label: 'Bon de commande / engagement juridique', value: period?.order_ref, copyable: true },
    { label: 'Payeur', value: period?.payer_name, copyable: true, billing: true },
    {
      label: 'SIRET du payeur',
      value: period?.payer_siret && formatSiret(period.payer_siret),
      copyable: true,
      billing: true,
    },
    {
      label: 'Code service de facturation',
      value: period?.payer_service_code,
      copyable: true,
      billing: true,
    },
  ];
  return rows.filter((row): row is Reference => Boolean(row.value));
}

/** The lines a support request needs, ready to paste. */
export function supportText(standing: SubscriptionSummary, context: SupportContext): string {
  return references(standing, context)
    .map(({ label, value }) => `${label} : ${value}`)
    .join('\n');
}

export function supportMailto(email: string, subject: string, intro: string, text: string): string {
  const body = `Bonjour,\n\n${intro}\n\n${text}\n`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function quoteLabel(standing: SubscriptionSummary): string {
  return standing.current?.kind === 'trial'
    ? 'Demander un devis'
    : 'Demander un devis de renouvellement';
}

export function quoteMailto(
  email: string,
  standing: SubscriptionSummary,
  siteName: string,
  text: string
): string {
  const trial = standing.current?.kind === 'trial';
  const subject = trial
    ? `Abonnement après l'essai — ${siteName}`
    : `Renouvellement de l'abonnement — ${siteName}`;
  const request = trial
    ? `un devis pour l'abonnement de ${siteName} à la fin de son essai`
    : `un devis pour le renouvellement de l'abonnement de ${siteName}`;
  return supportMailto(email, subject, `Pouvez-vous nous adresser ${request} ?`, text);
}

export interface SupportRequest {
  label: string;
  subject: string;
  intro: string;
}

export function supportRequests(siteName: string, organization: string): SupportRequest[] {
  return [
    {
      label: 'Demander un devis',
      subject: `Demande de devis — ${siteName}`,
      intro: `Pouvez-vous nous adresser un devis pour ${siteName} ?`,
    },
    {
      label: 'Ajouter ou retirer un site',
      subject: `Ajout ou retrait d'un site — ${organization}`,
      intro: 'Nous souhaitons ajouter ou retirer un site :',
    },
    {
      label: 'Obtenir une copie de vos données',
      subject: `Copie des données — ${siteName}`,
      intro: `Pouvez-vous nous remettre une copie des données de ${siteName} ?`,
    },
  ];
}
