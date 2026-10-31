import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { needsSecuritySetup } from '@/hooks/useSecurityOnboarding';
import { useUiPreferences, useUpdateUiPreferences } from '@/hooks/useUiPreferences';
import { TOUR_FLAGS, type TourName } from './steps';

const MOBILE_QUERY = '(max-width: 1023px)';

export function useTour(tour: TourName, enabled: boolean) {
  const { user } = useAuth();
  // Such an account is on its way to the enrolment page, which would leave the tour pointing at nothing.
  const active = enabled && !needsSecuritySetup(user);
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const { data: prefs } = useUiPreferences(active);
  const update = useUpdateUiPreferences();

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const flag = TOUR_FLAGS[tour];
  const finish = useCallback(() => {
    update.mutate({ [flag]: true });
  }, [flag, update]);

  return {
    running: active && prefs !== undefined && !prefs[flag],
    mobile,
    finish,
  };
}
