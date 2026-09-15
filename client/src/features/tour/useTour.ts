import { useCallback, useEffect, useState } from 'react';
import { useUiPreferences, useUpdateUiPreferences } from '@/hooks/useUiPreferences';
import { TOUR_FLAGS, type TourName } from './steps';

const MOBILE_QUERY = '(max-width: 1023px)';

export function useTour(tour: TourName, enabled: boolean) {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const { data: prefs } = useUiPreferences(enabled);
  const update = useUpdateUiPreferences();

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const flag = TOUR_FLAGS[tour];
  const finish = useCallback(() => {
    // A tour that stays on screen because the write failed is worse than one
    // replayed on the next visit.
    update.mutate({ [flag]: true });
  }, [flag, update]);

  return {
    running: enabled && prefs !== undefined && !prefs[flag],
    mobile,
    finish,
  };
}
