/**
 * Animation "vol vers l'aperçu" : un clone stylé comme la box d'item part
 * du point d'interaction et rejoint l'aperçu du menu (panel desktop ou
 * poignée mobile). Discret, ~450 ms, désactivé si prefers-reduced-motion.
 */
import { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import type { CategoryColor } from '@/lib/category-colors';

interface Flight {
  id: number;
  label: string;
  color: CategoryColor;
  from: { x: number; y: number; width: number };
  to: { x: number; y: number };
}

let flightId = 0;

export function useFlyToPreview() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const targetsRef = useRef<Map<string, HTMLElement | null>>(new Map());
  const reducedMotion = useReducedMotion();

  /** Les aperçus (panel desktop, poignée mobile) enregistrent leur élément cible. */
  const registerTarget = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      targetsRef.current.set(key, el);
    },
    []
  );

  const fly = useCallback(
    (sourceEl: HTMLElement | null, label: string, color: CategoryColor) => {
      if (reducedMotion || !sourceEl) return;
      // Cible active = celle qui est réellement visible au breakpoint courant
      let target: DOMRect | null = null;
      for (const el of targetsRef.current.values()) {
        const rect = el?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          target = rect;
          break;
        }
      }
      if (!target) return;
      const src = sourceEl.getBoundingClientRect();
      setFlights((prev) => [
        ...prev,
        {
          id: ++flightId,
          label,
          color,
          from: { x: src.left, y: src.top, width: src.width },
          to: {
            x: target.left + target.width / 2 - 20,
            y: target.top + target.height / 2 - 14,
          },
        },
      ]);
    },
    [reducedMotion]
  );

  const overlay =
    flights.length === 0
      ? null
      : createPortal(
          <>
            {flights.map((f) => (
              <motion.div
                key={f.id}
                className="pointer-events-none fixed left-0 top-0 z-[60] max-w-[180px] truncate rounded-xl px-2 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: f.color.bg,
                  color: f.color.label,
                  borderBottom: `3px solid ${f.color.border}`,
                }}
                initial={{
                  x: f.from.x,
                  y: f.from.y,
                  width: Math.min(f.from.width, 180),
                  opacity: 1,
                  scale: 1,
                }}
                animate={{ x: f.to.x, y: f.to.y, width: 40, opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
                onAnimationComplete={() => setFlights((prev) => prev.filter((p) => p.id !== f.id))}
              >
                {f.label}
              </motion.div>
            ))}
          </>,
          document.body
        );

  return { fly, registerTarget, overlay };
}
