import { describe, expect, it } from 'vitest';
import type { Subscription, SubscriptionPeriod } from '@/lib/api/subscriptions';
import {
  addYears,
  canRequestRenewal,
  contractTimeline,
  formatSiret,
  headline,
  longDate,
  nextReconduction,
  quoteMailto,
  renewalFacts,
  siteBadge,
  siteBadgeTitle,
  statusBadge,
  supportText,
} from '@/features/subscription/subscription-view';

const YEAR: SubscriptionPeriod = {
  kind: 'paid',
  starts_on: '2027-01-01',
  ends_on: '2027-12-31',
  renewal: 'undecided',
  tacit_until: null,
  notice_by: null,
  quote_ref: 'D-2026-014',
  order_ref: null,
  payer_name: null,
  payer_siret: null,
  payer_service_code: null,
  renewed_tacitly: false,
};

const TACIT: SubscriptionPeriod = {
  ...YEAR,
  renewal: 'tacit',
  tacit_until: '2029-12-31',
  notice_by: '2027-09-30',
};

const TODAY = '2027-06-15';

function standing(overrides: Partial<Subscription> = {}): Subscription {
  return {
    state: 'active',
    end: 'undecided',
    days_left: 200,
    current: YEAR,
    next: null,
    past: [],
    ...overrides,
  };
}

const tacit = (current: Partial<SubscriptionPeriod> = {}) =>
  standing({ end: 'covered', current: { ...TACIT, ...current } });

describe('dates', () => {
  it('writes the first of the month as French does', () => {
    expect(longDate('2028-01-01')).toBe('1er janvier 2028');
    expect(longDate('2027-09-30')).toBe('30 septembre 2027');
  });

  it('moves 29 February to the 28th, as the server does', () => {
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28');
    expect(addYears('2027-03-01', 1)).toBe('2028-03-01');
  });

  it('groups a SIRET as it is printed', () => {
    expect(formatSiret('12345678900012')).toBe('123 456 789 00012');
  });
});

describe('statusBadge', () => {
  it('raises no alarm far from an end still to decide', () => {
    expect(statusBadge(standing()).label).toBe('Abonnement actif');
  });

  it('says the end is near within thirty days, unless it is covered', () => {
    expect(statusBadge(standing({ days_left: 12 })).label).toBe('Échéance proche');
    expect(statusBadge(standing({ days_left: 12, end: 'covered' })).label).toBe('Abonnement actif');
  });

  it('keeps a trial a trial to its last day', () => {
    const trial = standing({ current: { ...YEAR, kind: 'trial' }, days_left: 3 });

    expect(statusBadge(trial)).toEqual({ label: 'Essai gratuit', tone: 'trial' });
    expect(headline(trial).detail).toBe('3 jours restants');
  });
});

describe('siteBadge', () => {
  it('reads Actif while the subscription has nothing to say', () => {
    expect(siteBadge(true, standing()).label).toBe('Actif');
    expect(siteBadge(true, standing({ current: { ...YEAR, kind: 'complimentary' } })).label).toBe(
      'Actif'
    );
    expect(siteBadge(true, undefined).label).toBe('Actif');
  });

  it('takes the state of the subscription when there is something to know', () => {
    expect(siteBadge(true, standing({ days_left: 12 })).label).toBe('Échéance proche');
    expect(siteBadge(true, standing({ current: { ...YEAR, kind: 'trial' } })).label).toBe(
      'Essai gratuit'
    );
    expect(siteBadge(true, standing({ state: 'expired', current: null, end: null })).label).toBe(
      'Arrivé à échéance'
    );
  });

  it('says Inactif for a disabled site, whatever its subscription', () => {
    expect(siteBadge(false, standing({ days_left: 12 }))).toEqual({
      label: 'Inactif',
      tone: 'muted',
    });
  });

  it('gives the end of the period on hover', () => {
    expect(siteBadgeTitle(standing())).toBe("Abonnement jusqu'au 31 décembre 2027");
    expect(siteBadgeTitle(undefined)).toBeUndefined();
  });
});

describe('nextReconduction', () => {
  it('runs a year from the day after the period, capped by the last date planned', () => {
    expect(nextReconduction(tacit())).toEqual({ starts_on: '2028-01-01', ends_on: '2028-12-31' });
    expect(nextReconduction(tacit({ tacit_until: '2028-08-31' }))).toEqual({
      starts_on: '2028-01-01',
      ends_on: '2028-08-31',
    });
  });

  it('stops the day before a period recorded later', () => {
    const next = { ...YEAR, starts_on: '2028-07-01', ends_on: '2029-06-30' };

    expect(nextReconduction({ ...tacit(), next })?.ends_on).toBe('2028-06-30');
  });
});

describe('renewalFacts', () => {
  it('gives a tacit reconduction its period, its last day to decline and the end of the contract', () => {
    expect(renewalFacts(tacit(), TODAY)).toEqual([
      {
        kind: 'reconduction',
        text: "Reconduction tacite le 1er janvier 2028, jusqu'au 31 décembre 2028.",
      },
      {
        kind: 'notice',
        text:
          'Pour ne pas reconduire : décision à nous notifier au plus tard le 30 septembre 2027, ' +
          'selon les modalités du contrat.',
      },
      { kind: 'horizon', text: "Reconductions possibles jusqu'au 31 décembre 2029." },
    ]);
  });

  it('says when the reconduction ahead is the last one', () => {
    const facts = renewalFacts(tacit({ tacit_until: '2028-12-31' }), TODAY);

    expect(facts[0].text).toBe(
      "Reconduction tacite le 1er janvier 2028, jusqu'au 31 décembre 2028, la dernière prévue au contrat."
    );
    expect(facts.map((fact) => fact.kind)).toEqual(['reconduction', 'notice']);
  });

  it('drops the last day to decline once it has passed', () => {
    expect(renewalFacts(tacit(), '2027-10-01').map((fact) => fact.kind)).toEqual([
      'reconduction',
      'horizon',
    ]);
    expect(contractTimeline(tacit(), '2027-10-01')?.notice).toBeNull();
  });

  it('names the next period when one follows the day after', () => {
    const next = { ...YEAR, starts_on: '2028-01-01', ends_on: '2028-12-31' };

    expect(renewalFacts(standing({ end: 'covered', next }), TODAY)).toEqual([
      {
        kind: 'renewed',
        text: 'Renouvelé : prochaine période du 1er janvier 2028 au 31 décembre 2028.',
      },
    ]);
  });

  it('announces an end of service with the copy of the data', () => {
    expect(renewalFacts(standing({ end: 'ending' }), TODAY).map((fact) => fact.kind)).toEqual([
      'ending',
      'data',
    ]);
  });

  it('asks for a quote only while the renewal is to decide', () => {
    expect(canRequestRenewal(standing())).toBe(true);
    expect(canRequestRenewal(standing({ end: 'covered' }))).toBe(false);
    expect(canRequestRenewal(standing({ end: 'ending' }))).toBe(false);
    expect(canRequestRenewal(standing({ state: 'expired', end: null, current: null }))).toBe(true);
  });
});

describe('contractTimeline', () => {
  it('draws the current year, then each year of reconduction up to the end of the contract', () => {
    const geometry = contractTimeline(tacit(), '2027-07-02');

    expect(geometry?.segments.map((part) => [part.kind, part.label, part.days])).toEqual([
      ['current', '2027', 365],
      ['reconduction', '2028', 366],
      ['reconduction', '2029', 365],
    ]);
    expect(geometry?.elapsed).toBeCloseTo(0.5, 2);
    expect(geometry?.notice).toBeCloseTo(0.75, 2);
  });

  it('draws a recorded next period instead of reconductions', () => {
    const next = { ...YEAR, starts_on: '2027-09-01', ends_on: '2028-08-31' };
    const geometry = contractTimeline(
      standing({ end: 'covered', current: { ...TACIT, ends_on: '2027-08-31' }, next }),
      TODAY
    );

    expect(geometry?.segments.map((part) => [part.kind, part.label])).toEqual([
      ['current', '2027'],
      ['next', '2027-2028'],
    ]);
    expect(geometry?.notice).toBeNull();
  });

  it('draws the current period alone while its renewal is to decide', () => {
    expect(contractTimeline(standing(), TODAY)?.segments).toHaveLength(1);
  });
});

describe('supportText', () => {
  it('lists what identifies the site, in the order of the references card', () => {
    const period = {
      ...YEAR,
      order_ref: '2100045871',
      payer_name: 'Organisation Démo',
      payer_siret: '12345678900012',
      payer_service_code: 'RESTAURATION',
    };
    const text = supportText(standing({ current: period }), {
      organization: 'Organisation Démo',
      site: 'Resto U des Tilleuls',
      path: 'demo/tilleuls',
    });

    expect(text.split('\n')).toEqual([
      'Organisation : Organisation Démo',
      'Site : Resto U des Tilleuls (demo/tilleuls)',
      'Période : Abonnement du 1er janvier 2027 au 31 décembre 2027',
      'Devis : D-2026-014',
      'Bon de commande / engagement juridique : 2100045871',
      'Payeur : Organisation Démo',
      'SIRET du payeur : 123 456 789 00012',
      'Code service de facturation : RESTAURATION',
    ]);
  });

  it('leaves out what is not set', () => {
    const text = supportText(standing(), {
      organization: 'Organisation Démo',
      site: 'Resto U des Tilleuls',
      path: 'demo/tilleuls',
    });

    expect(text).not.toContain('Bon de commande');
    expect(text).not.toContain('Payeur');
  });

  it('travels in a mailto address without breaking it', () => {
    const address = quoteMailto('support@example.org', standing(), 'Café & Co', 'Devis : D-1');
    const query = new URLSearchParams(address.split('?')[1]);

    expect(query.get('subject')).toBe("Renouvellement de l'abonnement — Café & Co");
    expect(query.get('body')).toContain('Devis : D-1');
  });
});
