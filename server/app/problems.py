"""Error responses as problem details (RFC 9457).

`detail` is the sentence shown to a person, in French; `code` is what a program
branches on, and never changes once published.
"""
from collections.abc import Iterator
from http import HTTPStatus
from typing import Any

import flask_smorest
from flask import Response, jsonify
from flask_smorest.utils import prepare_response
from werkzeug.exceptions import HTTPException

from .schemas.common import ProblemSchema

MEDIA_TYPE = 'application/problem+json'

# For the errors raised before any view decides: unknown route, refused method,
# a body that fails its schema, a rate limit, an unhandled exception.
_FRAMEWORK = {
    400: ('bad_request', 'Requête illisible.'),
    401: ('unauthorized', 'Authentification requise.'),
    403: ('forbidden', 'Accès refusé.'),
    404: ('not_found', 'Ressource introuvable.'),
    405: ('method_not_allowed', 'Méthode non autorisée sur cette ressource.'),
    413: ('payload_too_large', 'Requête trop volumineuse.'),
    415: ('unsupported_media_type', 'Format de requête non pris en charge.'),
    422: ('validation_failed', 'Certaines valeurs envoyées sont invalides.'),
    429: ('rate_limited', 'Vous avez dépassé la limite autorisée. Réessayez plus tard.'),
    500: ('internal_error', 'Erreur interne du serveur.'),
}

_BODY_LOCATIONS = {'json', 'form', 'files', 'json_or_form'}


class Problem(Exception):
    """Raised anywhere in a request, answered as a problem."""

    def __init__(
        self, status: int, code: str, detail: str,
        headers: dict[str, str] | None = None, **extensions: Any,
    ):
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail
        self.headers = headers
        self.extensions = extensions


def problem_response(
    status: int,
    code: str,
    detail: str,
    headers: dict[str, str] | None = None,
    **extensions: Any,
) -> Response:
    response = jsonify({
        'title': HTTPStatus(status).phrase,
        'status': status,
        'detail': detail,
        'code': code,
        **extensions,
    })
    response.status_code = status
    response.mimetype = MEDIA_TYPE
    if headers:
        response.headers.update(headers)
    return response


def answer_problem(error: Problem) -> Response:
    return problem_response(
        error.status, error.code, error.detail, headers=error.headers, **error.extensions
    )


def _flatten(node: Any, path: tuple[str, ...] = ()) -> Iterator[tuple[tuple[str, ...], str]]:
    if isinstance(node, dict):
        for key, value in node.items():
            # marshmallow files an error about the whole object under _schema.
            yield from _flatten(value, path if key == '_schema' else (*path, str(key)))
    elif isinstance(node, list):
        for message in node:
            yield from _flatten(message, path)
    else:
        yield path, str(node)


def _pointer(path: tuple[str, ...]) -> str:
    return ''.join('/' + part.replace('~', '~0').replace('/', '~1') for part in path)


def validation_issues(messages: dict[str, Any]) -> list[dict[str, str]]:
    """webargs messages, keyed by location, as one entry per field and message."""
    issues = []
    for location, fields in messages.items():
        for path, detail in _flatten(fields):
            if location in _BODY_LOCATIONS:
                issues.append({'pointer': _pointer(path), 'detail': detail})
            else:
                issues.append({'parameter': '.'.join(path) or location, 'detail': detail})
    return issues


def http_problem(error: HTTPException) -> Response:
    status = error.code or 500
    code, detail = _FRAMEWORK.get(status, (f'http_{status}', HTTPStatus(status).phrase))
    data = getattr(error, 'data', None) or {}
    # Allow on a 405, WWW-Authenticate on a 401: the headers HTTP requires.
    headers = {k: v for k, v in error.get_headers() if k.lower() != 'content-type'}
    headers.update(data.get('headers') or {})
    extensions = {}
    if status == 422 and data.get('messages'):
        extensions['errors'] = validation_issues(data['messages'])
    return problem_response(status, code, detail, headers=headers, **extensions)


class Blueprint(flask_smorest.Blueprint):
    def problem(self, status: int, *codes: str):
        """Documents a problem the route answers, and the codes it carries."""
        return self.alt_response(
            status, schema=ProblemSchema, content_type=MEDIA_TYPE,
            description=', '.join(f'`{code}`' for code in codes),
        )


class Api(flask_smorest.Api):
    """flask-smorest, answering and documenting every error as a problem."""

    ERROR_SCHEMA = ProblemSchema

    def handle_http_exception(self, error):
        return http_problem(error)

    def _register_responses(self):
        # flask-smorest documents these shared error responses under the media
        # type of every other response, and offers no setting for it.
        for status in HTTPStatus:
            response: dict[str, Any] = {'description': status.phrase}
            if not (100 <= status < 200) and status not in (204, 304):
                response['schema'] = self.ERROR_SCHEMA
            prepare_response(response, self.spec, MEDIA_TYPE)
            self.spec.components.response(status.name, response, lazy=True)
        response = {'description': 'Default error response', 'schema': self.ERROR_SCHEMA}
        prepare_response(response, self.spec, MEDIA_TYPE)
        self.spec.components.response(self.DEFAULT_ERROR_RESPONSE_NAME, response, lazy=True)
