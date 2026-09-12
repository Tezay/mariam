import { useCallback, useRef, useState } from 'react';

/** Below this, the gesture is a click, not a selection. */
const DRAG_THRESHOLD = 4;

const INTERACTIVE = 'button, a, input, select, textarea, [role="button"], [role="checkbox"]';

export interface RubberBandRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Lasso selection over a scrollable container, as a file explorer does it.
 *
 * The gesture starts on empty ground only: items and controls keep their own
 * clicks. Pointer capture is deferred until the pointer has actually moved, so
 * a plain click still reaches whatever sits under it.
 */
export function useRubberBand<T extends HTMLElement>({
  containerRef,
  itemSelector,
  onSelect,
  enabled = true,
  mouseOnly = false,
}: {
  containerRef: React.RefObject<T | null>;
  itemSelector: string;
  onSelect: (elements: HTMLElement[]) => void;
  enabled?: boolean;
  /** Leaves touch scrolling alone where the lasso is a desktop convenience. */
  mouseOnly?: boolean;
}) {
  const [rect, setRect] = useState<RubberBandRect | null>(null);
  const pending = useRef(false);
  const active = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const reset = useCallback(() => {
    pending.current = false;
    active.current = false;
    start.current = null;
    setRect(null);
  }, []);

  const point = useCallback(
    (event: React.PointerEvent) => {
      const container = containerRef.current;
      if (!container) return null;
      const bounds = container.getBoundingClientRect();
      return {
        x: event.clientX - bounds.left + container.scrollLeft,
        y: event.clientY - bounds.top + container.scrollTop,
      };
    },
    [containerRef]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled || event.button !== 0) return;
      if (mouseOnly && event.pointerType !== 'mouse') return;
      const target = event.target as HTMLElement;
      if (target.closest(itemSelector) || target.closest(INTERACTIVE)) return;
      const origin = point(event);
      if (!origin) return;
      pending.current = true;
      active.current = false;
      start.current = origin;
    },
    [enabled, itemSelector, mouseOnly, point]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!pending.current || !start.current) return;
      const current = point(event);
      if (!current) return;
      if (
        !active.current &&
        (Math.abs(current.x - start.current.x) > DRAG_THRESHOLD ||
          Math.abs(current.y - start.current.y) > DRAG_THRESHOLD)
      ) {
        active.current = true;
        containerRef.current?.setPointerCapture(event.pointerId);
      }
      if (active.current) {
        setRect({ x1: start.current.x, y1: start.current.y, x2: current.x, y2: current.y });
      }
    },
    [containerRef, point]
  );

  const onPointerUp = useCallback(() => {
    if (!pending.current) return;
    const wasActive = active.current;
    const container = containerRef.current;
    pending.current = false;
    active.current = false;
    start.current = null;

    if (!wasActive || !container || !rect) {
      setRect(null);
      return;
    }

    const area = {
      left: Math.min(rect.x1, rect.x2),
      top: Math.min(rect.y1, rect.y2),
      right: Math.max(rect.x1, rect.x2),
      bottom: Math.max(rect.y1, rect.y2),
    };
    setRect(null);
    if (area.right - area.left < DRAG_THRESHOLD && area.bottom - area.top < DRAG_THRESHOLD) return;

    const bounds = container.getBoundingClientRect();
    const hits: HTMLElement[] = [];
    container.querySelectorAll<HTMLElement>(itemSelector).forEach((element) => {
      const box = element.getBoundingClientRect();
      const left = box.left - bounds.left + container.scrollLeft;
      const top = box.top - bounds.top + container.scrollTop;
      if (
        left + box.width > area.left &&
        left < area.right &&
        top + box.height > area.top &&
        top < area.bottom
      ) {
        hits.push(element);
      }
    });
    if (hits.length > 0) onSelect(hits);
  }, [containerRef, itemSelector, onSelect, rect]);

  return {
    rect,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
