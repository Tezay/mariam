export type DeltaTone = 'positive' | 'negative' | 'neutral';

export interface KpiDelta {
  text: string;
  tone: DeltaTone;
}

/** Higher is better for every rate we surface, so the sign drives the tone. */
export function rateDelta(delta: number | null | undefined, text: string | null): KpiDelta | null {
  if (!text || delta === null || delta === undefined) return null;
  return { text, tone: delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral' };
}
