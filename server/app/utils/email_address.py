import re

EMAIL_MAX_LENGTH = 120
# Kept in step with client/src/lib/email-address.ts. Written to mean the same to
# Python and to PostgreSQL, which checks it on users.email.
EMAIL_SHAPE = r'[!-~]+@[!-~]+'
_SHAPE = re.compile(EMAIL_SHAPE)


def canonical_email(value: str) -> str:
    email = value.strip().lower()
    # ASCII only: users.email is checked against PostgreSQL's lower(), which can
    # disagree with Python's outside ASCII.
    if len(email) > EMAIL_MAX_LENGTH or not _SHAPE.fullmatch(email):
        raise ValueError('Adresse e-mail invalide')
    return email
