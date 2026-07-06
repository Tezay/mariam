/**
 * Indice de swipe : suggère le geste une seule fois par session navigateur.
 */
let hintConsumed = false;

/** Renvoie true au plus une fois par session ; false ensuite. */
export function consumeSwipeHint(): boolean {
    if (hintConsumed) return false;
    hintConsumed = true;
    return true;
}
