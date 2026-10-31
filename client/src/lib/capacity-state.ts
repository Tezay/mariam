export type CapacityState = 'available' | 'reached' | 'idle';

export function capacityState(reached: boolean | null, inService: boolean): CapacityState {
  if (!inService || reached === null) return 'idle';
  return reached ? 'reached' : 'available';
}
