from datetime import date

from werkzeug.routing import BaseConverter, ValidationError


class IsoDateConverter(BaseConverter):
    """`<date:…>` in a route: an ISO date, or no match."""

    def to_python(self, value: str) -> date:
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise ValidationError() from None

    def to_url(self, value: date) -> str:
        return value.isoformat()
