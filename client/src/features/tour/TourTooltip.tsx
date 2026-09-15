import type { TooltipRenderProps } from 'react-joyride';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TourTooltip({
  index,
  size,
  step,
  backProps,
  closeProps,
  primaryProps,
  tooltipProps,
  isLastStep,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      className="w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        {step.title && <p className="text-sm font-semibold text-foreground">{step.title}</p>}
        <button
          {...closeProps}
          className="-m-1 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.content}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">
          {index + 1} / {size}
        </span>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <Button {...backProps} variant="ghost" size="sm">
              Précédent
            </Button>
          )}
          <Button {...primaryProps} size="sm" className="rounded-xl">
            {isLastStep ? 'Terminer' : 'Suivant'}
          </Button>
        </div>
      </div>
    </div>
  );
}
