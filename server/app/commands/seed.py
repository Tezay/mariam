"""
flask seed — Seed reference taxonomy data (dietary tags, certifications).

Idempotent: safe to re-run at any time. Uses merge() for upserts so existing
data is updated and missing data is inserted. Keywords are replaced in full.

Usage:
    docker compose exec backend flask seed
"""
import click

from ..data.taxonomy import (
    CERTIFICATION_CATEGORIES,
    CERTIFICATION_KEYWORDS,
    CERTIFICATIONS,
    DIETARY_TAG_CATEGORIES,
    DIETARY_TAG_KEYWORDS,
    DIETARY_TAGS,
)
from ..extensions import db
from ..models.taxonomy import (
    Certification,
    CertificationCategory,
    CertificationKeyword,
    DietaryTag,
    DietaryTagCategory,
    DietaryTagKeyword,
)


def register_commands(app):
    @app.cli.command('seed')
    def seed_db():
        """Seed reference taxonomy data. Idempotent — safe to re-run."""
        tag_cat_count = _upsert_dietary_tag_categories()
        tag_count = _upsert_dietary_tags()
        kw_count = _upsert_dietary_tag_keywords()
        cert_cat_count = _upsert_certification_categories()
        cert_count = _upsert_certifications()
        cert_kw_count = _upsert_certification_keywords()
        db.session.commit()

        click.echo('\n' + '=' * 50)
        click.echo('  SEED — Taxonomie')
        click.echo('=' * 50)
        click.echo(f'  Tags catégories     : {tag_cat_count}')
        click.echo(f'  Tags alimentaires   : {tag_count}  ({kw_count} mots-clés)')
        click.echo(f'  Cert. catégories    : {cert_cat_count}')
        click.echo(f'  Certifications      : {cert_count}  ({cert_kw_count} mots-clés)')
        click.echo('=' * 50)
        click.echo('  ✅  Terminé — base à jour.\n')


def _upsert_dietary_tag_categories() -> int:
    count = 0
    for data in DIETARY_TAG_CATEGORIES:
        obj = DietaryTagCategory(
            id=data['id'],
            name=data['name'],
            color=data.get('color'),
            sort_order=data.get('sort_order', 0),
        )
        db.session.merge(obj)
        count += 1
    return count


def _upsert_dietary_tags() -> int:
    count = 0
    for data in DIETARY_TAGS:
        obj = DietaryTag(
            id=data['id'],
            label=data['label'],
            icon=data['icon'],
            color=data['color'],
            category_id=data['category_id'],
            sort_order=data.get('sort_order', 0),
        )
        db.session.merge(obj)
        count += 1
    return count


def _upsert_dietary_tag_keywords() -> int:
    """Replace all keywords for each tag (delete + re-insert)."""
    db.session.flush()
    total = 0
    for tag_id, keywords in DIETARY_TAG_KEYWORDS.items():
        DietaryTagKeyword.query.filter_by(tag_id=tag_id).delete()
        for kw in keywords:
            db.session.add(DietaryTagKeyword(tag_id=tag_id, keyword=kw))
            total += 1
    return total


def _upsert_certification_categories() -> int:
    count = 0
    for data in CERTIFICATION_CATEGORIES:
        obj = CertificationCategory(
            id=data['id'],
            name=data['name'],
            sort_order=data.get('sort_order', 0),
        )
        db.session.merge(obj)
        count += 1
    return count


def _upsert_certifications() -> int:
    count = 0
    for data in CERTIFICATIONS:
        obj = Certification(
            id=data['id'],
            name=data['name'],
            official_name=data['official_name'],
            issuer=data['issuer'],
            scheme_type=data['scheme_type'],
            jurisdiction=data['jurisdiction'],
            guarantee=data.get('guarantee'),
            logo_filename=data['logo_filename'],
            category_id=data['category_id'],
            sort_order=data.get('sort_order', 0),
        )
        db.session.merge(obj)
        count += 1
    return count


def _upsert_certification_keywords() -> int:
    """Replace all keywords for each certification (delete + re-insert)."""
    db.session.flush()
    total = 0
    for cert_id, keywords in CERTIFICATION_KEYWORDS.items():
        CertificationKeyword.query.filter_by(certification_id=cert_id).delete()
        for kw in keywords:
            db.session.add(CertificationKeyword(certification_id=cert_id, keyword=kw))
            total += 1
    return total
