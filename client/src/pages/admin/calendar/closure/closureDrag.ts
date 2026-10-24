import type { Closure } from '@/lib/api/closures';

export type DragMode =
  | { kind: 'selecting'; start: string; hover: string }
  | { kind: 'handle'; closure: Closure; handle: 'start' | 'end'; hover: string };

export function orderDates(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}
