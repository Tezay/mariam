"""`flask site export`: the archive a client receives of its site's data."""
import csv
import io
import json
import zipfile

import pytest

from app.extensions import db
from app.models import DishCatalog, Restaurant, RestaurantPhoto
from app.models.menu_vote import MenuVote
from app.services import catalog_csv


def _read_csv(archive: zipfile.ZipFile, name: str) -> list[list[str]]:
    text = archive.read(name).decode('utf-8-sig')
    return list(csv.reader(io.StringIO(text), delimiter=';'))


@pytest.fixture()
def archive(app, bucket, tmp_path):
    seeded = app.test_cli_runner().invoke(args=['seed-demo', '--password', 'demo-password-1'])
    assert seeded.exit_code == 0, seeded.output
    site = Restaurant.query.filter_by(slug='demo').one()
    db.session.add(DishCatalog(restaurant_id=site.id, name='=HYPERLINK("http://x")'))
    db.session.add_all([
        RestaurantPhoto(restaurant_id=site.id, storage_key='photos/here.jpg',
                        url='https://i/here.jpg', alt='Salle'),
        RestaurantPhoto(restaurant_id=site.id, storage_key='photos/gone.jpg',
                        url='https://i/gone.jpg', alt='Cour', order=1),
    ])
    db.session.commit()
    bucket.objects['photos/here.jpg'] = b'jpeg bytes'
    out = tmp_path / 'demo.zip'

    result = app.test_cli_runner().invoke(
        args=['site', 'export', 'demo', '--org', 'demo', '--out', str(out)]
    )

    assert result.exit_code == 0, result.output
    with zipfile.ZipFile(out) as opened:
        yield opened, result.output


class TestTheArchive:
    def test_it_holds_each_kind_of_data(self, archive):
        opened, _ = archive

        assert {
            'site.json', 'categories.json', 'actualites.json', 'menus.csv', 'plats.csv',
            'fermetures.csv', 'comptes.csv', 'votes.csv', 'egalim.csv', 'journal.csv',
        } <= set(opened.namelist())
        assert json.loads(opened.read('site.json'))['slug'] == 'demo'
        assert len(_read_csv(opened, 'menus.csv')) > 1

    def test_its_catalogue_reads_back_into_the_import(self, archive):
        opened, _ = archive

        assert catalog_csv.is_export_file(_read_csv(opened, 'plats.csv')[0])

    def test_no_cell_starts_a_formula(self, archive):
        opened, _ = archive
        names = [row[0] for row in _read_csv(opened, 'plats.csv')[1:]]

        assert "'=HYPERLINK(\"http://x\")" in names

    def test_votes_carry_no_device(self, app, archive):
        opened, _ = archive
        devices = {vote.device_id for vote in MenuVote.query if vote.device_id}
        text = opened.read('votes.csv').decode('utf-8-sig')

        assert devices and not any(device in text for device in devices)

    def test_an_image_missing_from_storage_is_named_not_fatal(self, archive):
        opened, output = archive

        assert opened.read('images/photos/1.jpg') == b'jpeg bytes'
        assert 'Not read from storage: images/photos/2.jpg' in output
