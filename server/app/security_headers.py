"""Security headers on every response of the API, whatever proxy stands in front."""
from flask import Flask, Response, request

HEADERS = {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    # Restaurant workstations are shared: no response is kept in a disk cache.
    'Cache-Control': 'no-store',
    # The pages are indexed from the frontend, not the JSON they are built from.
    'X-Robots-Tag': 'noindex',
}

API_POLICY = "default-src 'none'; frame-ancestors 'none'"


def configure_security_headers(app: Flask) -> None:
    swagger_ui = app.config['OPENAPI_SWAGGER_UI_URL']
    page_policies = {
        # Swagger UI loads from its CDN and starts from an inline script.
        'api-docs.openapi_swagger_ui': (
            f"default-src 'none'; script-src {swagger_ui} 'unsafe-inline'; "
            f"style-src {swagger_ui} 'unsafe-inline'; img-src 'self' data:; "
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
        ),
    }

    @app.after_request
    def _set_security_headers(response: Response) -> Response:
        for name, value in HEADERS.items():
            response.headers.setdefault(name, value)
        response.headers.setdefault(
            'Content-Security-Policy', page_policies.get(request.endpoint or '', API_POLICY)
        )
        return response
