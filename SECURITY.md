# Security Policy

## Supported Versions

Only the latest released version is actively supported with security fixes.

| Version | Supported |
|---------|-----------|
| latest  | ✅ |
| < latest | ❌ |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Send a report to **contact@mariam.app** with:
- A description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Any suggested fix (optional)

## Scope

The following areas are in scope:

- **Authentication & session management** — JWT handling, MFA/TOTP, Passkeys/WebAuthn
- **Authorization** — role enforcement (admin / editor / reader), route access control
- **File uploads** — MIME type validation, storage isolation
- **Public API data exposure** — ensuring draft menus and private data are never visible anonymously
- **Rate limiting** — bypass or circumvention of brute-force protections

Out of scope: social engineering, phishing, issues in third-party dependencies without a proof-of-concept exploit against this application.