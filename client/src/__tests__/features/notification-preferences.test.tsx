import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationPreferences } from '@/features/notifications/NotificationPreferences';
import type { NotifPreferences } from '@/lib/api/inbox';

const PREFS: NotifPreferences = {
  notify_menu_unpublished: true,
  notify_menu_during_service: true,
  notify_menu_tomorrow: true,
  notify_traffic_drop: true,
  notify_low_satisfaction: true,
  notify_vote_anomaly: true,
  notify_site_inactive: true,
  notify_holiday_approaching: true,
  holiday_alert_days_before: 5,
  weekly_digest: false,
  digest_day: 0,
  digest_hour: 8,
};

function switchesFor(scope: 'site' | 'org'): (string | null)[] {
  render(<NotificationPreferences prefs={PREFS} scope={scope} onChange={() => {}} />);
  return screen.getAllByRole('switch').map((toggle) => toggle.getAttribute('aria-label'));
}

describe('alert switches', () => {
  it('offers a site team the rules it can act on', () => {
    expect(switchesFor('site')).toEqual([
      'Menu du jour non publié',
      'Alerte urgente pendant le service',
      'Menu de demain non préparé',
      'Chute de fréquentation',
      'Satisfaction en baisse',
      'Votes suspects',
      'Alerter si un jour férié approche',
      'Résumé hebdomadaire par email',
    ]);
  });

  it('offers a supervisor the rules that reach it', () => {
    expect(switchesFor('org')).toEqual([
      'Alerte urgente pendant le service',
      'Chute de fréquentation',
      'Satisfaction en baisse',
      'Votes suspects',
      'Site sans activité',
      'Résumé hebdomadaire par email',
    ]);
  });
});
