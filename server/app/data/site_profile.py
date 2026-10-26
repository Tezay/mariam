"""What a site may say about itself, from closed lists the client mirrors."""

# Kept in step with PAYMENT_OPTIONS (client/src/pages/admin/settings/settings-shared.ts).
PAYMENT_METHODS = ('izly', 'cb', 'cash', 'ticket_restaurant')

SERVICES = (
    'wifi', 'microwave', 'takeaway', 'terrace', 'power_outlets', 'water_fountain', 'study_area',
)

# The hosts a link of each kind may lead to, subdomains included; any host for a website.
LINK_KINDS: dict[str, tuple[str, ...] | None] = {
    'website': None,
    'izly': ('izly.fr',),
    'instagram': ('instagram.com',),
    'facebook': ('facebook.com',),
    'linkedin': ('linkedin.com',),
    'x': ('x.com', 'twitter.com'),
    'tiktok': ('tiktok.com',),
    'youtube': ('youtube.com', 'youtu.be'),
}
LINKS_MAX = 6
