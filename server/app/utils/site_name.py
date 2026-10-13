import re
import unicodedata

SITE_NAME_MAX = 50
# What a mail client turns into a link: a scheme, a path, a mailbox, a domain.
_ADDRESS = re.compile(r'[/\\:@]|\.[^\W\d_]{2}')


# Kept in step with client/src/lib/site-name.ts.
def parse_site_name(value: str) -> str | None:
    name = ' '.join(unicodedata.normalize('NFC', value).split())
    if not 1 <= len(name) <= SITE_NAME_MAX or not name.isprintable():
        return None
    return None if _ADDRESS.search(name) else name
