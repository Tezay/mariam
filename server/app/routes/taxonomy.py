"""
Taxonomy routes for MARIAM — Dietary tag and certification catalog.

Used by the frontend to display labels, icons, colors and SVG logos
for certifications, and to populate admin selectors.

Public endpoints:
- GET /v1/taxonomy   Full dietary tag and certification catalog
"""
from flask import jsonify
from flask_smorest import Blueprint
from ..models import DietaryTagCategory, CertificationCategory
from ..security import limiter
from ..schemas.taxonomy import TaxonomySchema


taxonomy_bp = Blueprint(
    'taxonomy', __name__,
    description='Taxonomy — Dietary tag and certification catalog'
)


@taxonomy_bp.route('', methods=['GET'])
@limiter.limit("30 per minute")
@taxonomy_bp.response(200, TaxonomySchema)
def get_taxonomy():
    """Full dietary tag and certification catalog.

    No authentication required. Returns all tag categories (with their tags)
    and certification categories (with SVG logos), sorted by `sort_order`.

    Used by the frontend to:
    - Display labels, icons and colors
    - Render SVG logos for certifications
    - Populate selectors in the admin interface
    """
    tag_categories = DietaryTagCategory.query.order_by(
        DietaryTagCategory.sort_order
    ).all()
    cert_categories = CertificationCategory.query.order_by(
        CertificationCategory.sort_order
    ).all()

    return jsonify({
        'dietary_tag_categories': [c.to_dict() for c in tag_categories],
        'certification_categories': [c.to_dict() for c in cert_categories],
    }), 200
