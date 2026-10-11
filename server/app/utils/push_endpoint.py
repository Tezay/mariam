import re

_MAX_LENGTH = 2048

# A subscription comes from an anonymous caller and the server posts to its
# endpoint, so the endpoint has to sit on a browser's push service: Google's
# under two names, Mozilla's, then Apple's and Microsoft's by subdomain.
_HOSTS = (
    'fcm.googleapis.com',
    'jmt17.google.com',
    'updates.push.services.mozilla.com',
)
_DOMAINS = ('push.apple.com', 'notify.windows.com')

# Matched as text rather than parsed: the host is what stands before the first
# slash for every URL parser, so none can be led to read another one.
_SHAPE = re.compile(
    r'https://(?:{hosts}|(?:[a-z0-9-]+\.)+(?:{domains}))/[!-~]*'.format(
        hosts='|'.join(map(re.escape, _HOSTS)),
        domains='|'.join(map(re.escape, _DOMAINS)),
    )
)


def is_push_service_url(url: str) -> bool:
    return len(url) <= _MAX_LENGTH and _SHAPE.fullmatch(url) is not None
