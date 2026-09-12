"""Name matching that survives a typo, shared by the catalogue search.

Mirrors `client/src/lib/fuzzy.ts`: both must answer the same, since the dashboard
searches dishes through the API and everything else in the browser.
"""
import re
import unicodedata

LIGATURES = str.maketrans({'œ': 'oe', 'æ': 'ae'})


def normalize(text: str) -> str:
    """Case, accents, ligatures and spacing folded away.

    Unicode decomposition leaves œ and æ alone, and « bœuf » typed « boeuf » is
    the most ordinary search there is on this catalogue.
    """
    folded = unicodedata.normalize('NFD', text.casefold().translate(LIGATURES))
    stripped = ''.join(char for char in folded if unicodedata.category(char) != 'Mn')
    return re.sub(r'\s+', ' ', stripped).strip()


def _tolerance(token: str, word: str) -> int:
    """Edits allowed between two words, measured on the longer of the two.

    A query of three letters or fewer gets none: at that length everything is a
    neighbour of everything.
    """
    if len(token) < 4:
        return 0
    return 1 if max(len(token), len(word)) <= 7 else 2


def _within(a: str, b: str, limit: int) -> bool:
    """Levenshtein distance of at most `limit`, giving up as soon as it is exceeded."""
    if abs(len(a) - len(b)) > limit:
        return False
    previous = list(range(len(b) + 1))
    for i, char_a in enumerate(a, start=1):
        current = [i]
        for j, char_b in enumerate(b, start=1):
            current.append(min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (char_a != char_b),
            ))
        if min(current) > limit:
            return False
        previous = current
    return previous[-1] <= limit


def matches(name: str, query: str) -> bool:
    """Whether `name` answers `query`, allowing a typo per word."""
    haystack = normalize(name)
    needle = normalize(query)
    if not needle:
        return True
    if needle in haystack:
        return True

    words = haystack.split(' ')
    for token in needle.split(' '):
        if token in haystack:
            continue
        if any(_within(token, word, _tolerance(token, word)) for word in words):
            continue
        return False
    return True
