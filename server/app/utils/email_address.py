import re

EMAIL_MAX_LENGTH = 120
# Kept in step with client/src/lib/email-address.ts.
_SHAPE = re.compile(r'[!-~]+@[!-~]+')


def canonical_email(value: str) -> str:
    email = value.strip().lower()
    # ASCII only: users.email is checked against PostgreSQL's lower(), which can
    # disagree with Python's outside ASCII.
    if len(email) > EMAIL_MAX_LENGTH or not _SHAPE.fullmatch(email):
        raise ValueError('Adresse e-mail invalide')
    return email
