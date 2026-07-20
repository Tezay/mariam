"""Structured JSON logging with a per-request id.

Log level comes from ``LOG_LEVEL`` (default INFO). Every record emitted during a
request carries a ``request_id`` (taken from the ``X-Request-ID`` header or
generated), and that id is echoed back on the response so a client log line can
be correlated with the server logs.
"""
import json
import logging
import os
import uuid
from logging.config import dictConfig

from flask import Flask, Response, g, has_request_context, request


class RequestIdFilter(logging.Filter):
    """Attach the current request id (or ``-`` outside a request) to each record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = getattr(g, 'request_id', '-') if has_request_context() else '-'
        return True


class JsonFormatter(logging.Formatter):
    """Serialize log records as single-line JSON."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            'time': self.formatTime(record, '%Y-%m-%dT%H:%M:%S%z'),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'request_id': getattr(record, 'request_id', '-'),
        }
        if record.exc_info:
            payload['exc'] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(app: Flask) -> None:
    level = os.environ.get('LOG_LEVEL', 'INFO').upper()
    dictConfig({
        'version': 1,
        'disable_existing_loggers': False,
        'filters': {'request_id': {'()': RequestIdFilter}},
        'formatters': {'json': {'()': JsonFormatter}},
        'handlers': {
            'console': {
                'class': 'logging.StreamHandler',
                'formatter': 'json',
                'filters': ['request_id'],
            },
        },
        'root': {'level': level, 'handlers': ['console']},
    })

    @app.before_request
    def _assign_request_id() -> None:
        g.request_id = request.headers.get('X-Request-ID') or uuid.uuid4().hex

    @app.after_request
    def _echo_request_id(response: Response) -> Response:
        request_id = getattr(g, 'request_id', None)
        if request_id:
            response.headers['X-Request-ID'] = request_id
        return response
