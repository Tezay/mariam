import { CapacityDial } from '@/components/CapacityDial';
import { capacityText, type CapacityState } from '@/lib/capacity-state';
import { cn } from '@/lib/utils';

const TONES = {
  available: {
    dial: 'text-site-ok',
    title: 'text-site-ok',
    box: 'border-site-line bg-site-surface',
  },
  reached: {
    dial: 'text-site-danger',
    title: 'text-site-danger',
    box: 'border-site-danger-line bg-site-danger-soft',
  },
  idle: { dial: 'text-site-subtle', title: '', box: 'border-site-line bg-site-surface' },
};

export function CapacityGauge({
  capacity,
  state,
  reachedAt,
}: {
  capacity: number;
  state: CapacityState;
  reachedAt: string | null;
}) {
  const { title, lead, tail } = capacityText(capacity, state, reachedAt);

  return (
    <section
      aria-label="Capacité maximale"
      className={cn('flex items-center gap-4 rounded-[20px] border p-4 lg:p-5', TONES[state].box)}
    >
      <CapacityDial state={state} className={cn('h-[46px] w-[76px]', TONES[state].dial)} />
      <div className="min-w-0">
        <p
          aria-live="polite"
          className={cn('text-[17px] font-extrabold leading-tight', TONES[state].title)}
        >
          {title}
        </p>
        <p className="mt-1 text-[13px] text-site-subtle">
          {lead}
          {lead && tail && ' · '}
          {tail && <span className="whitespace-nowrap">{tail}</span>}
        </p>
      </div>
    </section>
  );
}
