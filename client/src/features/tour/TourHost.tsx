import { Suspense, lazy } from 'react';
import { useTour } from './useTour';
import type { TourName } from './steps';

// Kept out of the main chunk: only a user who actually takes the tour loads it.
const ProductTour = lazy(() => import('./ProductTour'));

export function TourHost({
  tour,
  enabled,
  canSeeStats = true,
}: {
  tour: TourName;
  enabled: boolean;
  canSeeStats?: boolean;
}) {
  const { running, mobile, finish } = useTour(tour, enabled);

  if (!running) return null;

  return (
    <Suspense fallback={null}>
      <ProductTour tour={tour} context={{ mobile, canSeeStats }} onFinish={finish} />
    </Suspense>
  );
}
