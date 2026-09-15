import { Joyride, STATUS, type EventData, type Locale } from 'react-joyride';
import { stepsFor, type TourContext, type TourName } from './steps';
import { TourTooltip } from './TourTooltip';

// Only reaches the screen through aria-labels and titles: the tooltip is ours.
const LOCALE: Locale = {
  back: 'Précédent',
  close: 'Fermer',
  last: 'Terminer',
  next: 'Suivant',
  open: 'Ouvrir',
  skip: 'Passer',
};

export default function ProductTour({
  tour,
  context,
  onFinish,
}: {
  tour: TourName;
  context: TourContext;
  onFinish: () => void;
}) {
  const handleEvent = ({ status }: EventData) => {
    // Skipping counts as finished: a tour the user closed must not come back.
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      onFinish();
    }
  };

  return (
    <Joyride
      steps={stepsFor(tour, context)}
      run
      continuous
      locale={LOCALE}
      tooltipComponent={TourTooltip}
      onEvent={handleEvent}
      options={{
        zIndex: 60,
        skipBeacon: true,
        // Spotlighting a link makes it clickable, and one click ends the tour.
        blockTargetInteraction: true,
        // Default would walk to the next step, which is not what a cross means.
        closeButtonAction: 'skip',
        overlayClickAction: false,
        overlayColor: 'hsl(var(--foreground) / 0.45)',
        arrowColor: 'hsl(var(--card))',
        spotlightRadius: 12,
      }}
    />
  );
}
