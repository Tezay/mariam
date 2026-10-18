from flask_smorest import Blueprint

from ..problems import Problem
from ..schemas.holidays import HolidayListSchema, SchoolHolidayListSchema, ZoneQuerySchema
from ..security import limiter
from ..services import holidays
from .helpers import editor_required

holidays_bp = Blueprint('holidays', __name__, description='French public and school holidays')

YEARS = range(2020, 2041)


def _check_year(year: int) -> None:
    if year not in YEARS:
        raise Problem(
            404, 'year_out_of_range', f'Années disponibles : {YEARS.start} à {YEARS.stop - 1}.'
        )


def _unavailable() -> Problem:
    return Problem(502, 'holidays_unavailable', 'Le calendrier officiel ne répond pas.')


@holidays_bp.route('/holidays/<int:year>', methods=['GET'])
@holidays_bp.doc(security=[])
@limiter.limit('30 per minute')
@holidays_bp.response(200, HolidayListSchema)
def list_holidays(year: int):
    """The public holidays of metropolitan France, from calendrier.api.gouv.fr."""
    _check_year(year)
    found = holidays.get_jours_feries(year)
    if found is None:
        raise _unavailable()
    return {'items': found}


@holidays_bp.route('/school-holidays/<int:year>', methods=['GET'])
@editor_required
@holidays_bp.arguments(ZoneQuerySchema, location='query')
@holidays_bp.response(200, SchoolHolidayListSchema)
def list_school_holidays(query, year: int):
    """A zone's school holidays over the school years that touch `year`,
    from data.education.gouv.fr.
    """
    _check_year(year)
    found = holidays.get_school_holidays(year, query['zone'])
    if found is None:
        raise _unavailable()
    return {'items': found}
