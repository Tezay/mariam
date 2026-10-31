from ..extensions import db
from ..models import AuditLog, EgalimDeclaration, Restaurant
from ..problems import Blueprint, Problem
from ..schemas.public import EgalimDeclarationSchema, QualitySchema
from ..schemas.quality import EgalimDeclarationInputSchema, EgalimDeclarationListSchema
from ..security import limiter, public_limit
from ..services.quality import quality_view
from ..utils.time import paris_today
from .helpers import audit, site_admin_required
from .scope import SESSION_OPTIONAL, finish_public_read, member_site, readable_site

quality_bp = Blueprint(
    'quality', __name__, description="A site's EGalim figures, and what its menus served"
)
quality_bp.after_request(finish_public_read)

# The purchases of 2019 are the first EGalim counts.
FIRST_YEAR = 2019


def _declaration(restaurant: Restaurant, year: int) -> EgalimDeclaration | None:
    return EgalimDeclaration.query.filter_by(restaurant_id=restaurant.id, year=year).first()


@quality_bp.route('/quality', methods=['GET'])
@quality_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@quality_bp.response(200, QualitySchema)
def get_quality(org: str, site: str):
    """The latest EGalim figures, and what the published menus of the last 30 days served."""
    restaurant, _ = readable_site(org, site)
    return quality_view(restaurant, paris_today())


@quality_bp.route('/egalim-declarations', methods=['GET'])
@quality_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@quality_bp.response(200, EgalimDeclarationListSchema)
def list_egalim_declarations(org: str, site: str):
    """Every year the site declared, the latest first."""
    restaurant, _ = readable_site(org, site)
    return {'items': EgalimDeclaration.query.filter_by(restaurant_id=restaurant.id)
            .order_by(EgalimDeclaration.year.desc()).all()}


@quality_bp.route('/egalim-declarations/<int:year>', methods=['PUT'])
@site_admin_required
@quality_bp.arguments(EgalimDeclarationInputSchema)
@quality_bp.response(200, EgalimDeclarationSchema, description="The year's figures replaced")
@quality_bp.alt_response(201, schema=EgalimDeclarationSchema, description="The year's first")
def put_egalim_declaration(body, org: str, site: str, year: int):
    """Declare the share of sustainable, organic and territorial products bought in a year."""
    restaurant = member_site(org, site)
    if not FIRST_YEAR <= year <= paris_today().year:
        raise Problem(
            422, 'egalim_year_invalid', f"L'année va de {FIRST_YEAR} à l'année en cours."
        )
    declaration = _declaration(restaurant, year)
    is_new = declaration is None
    if is_new:
        declaration = EgalimDeclaration(restaurant_id=restaurant.id, year=year)
        db.session.add(declaration)
    for field, value in body.items():
        setattr(declaration, field, value)
    audit(
        AuditLog.ACTION_EGALIM_DECLARATION_UPDATE,
        restaurant,
        details={
            'year': year,
            **{field: None if value is None else float(value) for field, value in body.items()},
        },
    )
    db.session.commit()
    return declaration, 201 if is_new else 200


@quality_bp.route('/egalim-declarations/<int:year>', methods=['DELETE'])
@site_admin_required
@quality_bp.response(204)
def delete_egalim_declaration(org: str, site: str, year: int):
    """Remove a year's figures."""
    restaurant = member_site(org, site)
    declaration = _declaration(restaurant, year)
    if declaration is None:
        raise Problem(404, 'egalim_declaration_not_found', 'Aucune déclaration pour cette année.')
    db.session.delete(declaration)
    audit(AuditLog.ACTION_EGALIM_DECLARATION_DELETE, restaurant, details={'year': year})
    db.session.commit()
