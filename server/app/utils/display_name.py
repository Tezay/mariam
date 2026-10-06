import re
import unicodedata

DISPLAY_NAME_MIN = 2
DISPLAY_NAME_MAX = 50
_SEPARATORS = frozenset(" .'’-")


# Kept in step with client/src/lib/display-name.ts.
def parse_display_name(value: str) -> str | None:
    # NFC first: a decomposed accent is a combining mark, not a letter.
    name = re.sub(r'\s+', ' ', unicodedata.normalize('NFC', value)).strip()
    if not DISPLAY_NAME_MIN <= len(name) <= DISPLAY_NAME_MAX:
        return None
    if not name[0].isalpha():
        return None
    if all(char.isalpha() or char in _SEPARATORS for char in name):
        return name
    return None
