let hintConsumed = false;

/** True the first time only, until the page reloads. */
export function consumeSwipeHint(): boolean {
  if (hintConsumed) return false;
  hintConsumed = true;
  return true;
}
