import { useState, useEffect } from 'react';

/** Shrinks when the mobile keyboard opens; `height` is null without the Visual Viewport API, where the caller falls back to 100dvh. */
export function useVisualViewportHeight(): { height: number | null; keyboardOpen: boolean } {
  const [height, setHeight] = useState<number | null>(() => window.visualViewport?.height ?? null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setHeight(vv.height));
    };
    vv.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', onResize);
    };
  }, []);

  const keyboardOpen = height !== null && height < window.innerHeight * 0.75;
  return { height, keyboardOpen };
}
