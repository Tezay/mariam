import type { CapacityState } from '@/lib/capacity-state';
import { cn } from '@/lib/utils';

const ARC = 'M6 40 A30 30 0 0 1 66 40';
// Fixed positions, not a measure: the team only says whether the service is full.
const SHARE = { available: 0.35, reached: 1, idle: 0 };
const NEEDLE = { available: 0.35, reached: 0.92, idle: 0 };
const MOTION = 'duration-700 ease-out motion-reduce:transition-none';

export function CapacityDial({ state, className }: { state: CapacityState; className?: string }) {
  return (
    <svg viewBox="0 0 72 44" aria-hidden className={cn('shrink-0', className)}>
      <path
        d={ARC}
        fill="none"
        strokeWidth={8}
        strokeLinecap="round"
        className="stroke-current opacity-20"
      />
      {state !== 'idle' && (
        <path
          d={ARC}
          pathLength={100}
          fill="none"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${SHARE[state] * 100} 100`}
          className={cn('stroke-current transition-[stroke-dasharray]', MOTION)}
        />
      )}
      <line
        x1={36}
        y1={40}
        x2={36}
        y2={19}
        strokeWidth={3}
        strokeLinecap="round"
        className={cn('stroke-current transition-transform', MOTION)}
        style={{
          transform: `rotate(${NEEDLE[state] * 180 - 90}deg)`,
          transformOrigin: '36px 40px',
        }}
      />
      <circle cx={36} cy={40} r={4} className="fill-current" />
    </svg>
  );
}
