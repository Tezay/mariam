import type { ExceptionalClosure } from '@/lib/api';

export type DragMode =
    | { kind: 'selecting'; start: string; hover: string }
    | { kind: 'handle'; closure: ExceptionalClosure; handle: 'start' | 'end'; hover: string };

export function orderDates(a: string, b: string): [string, string] {
    return a <= b ? [a, b] : [b, a];
}
