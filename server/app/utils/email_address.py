EMAIL_MAX_LENGTH = 120


def canonical_email(value: str) -> str:
    email = value.strip().lower()
    # ASCII only: users.email is checked against PostgreSQL's lower(), which can
    # disagree with Python's outside ASCII.
    if not email or not email.isascii() or len(email) > EMAIL_MAX_LENGTH:
        raise ValueError('Adresse e-mail invalide')
    return email
