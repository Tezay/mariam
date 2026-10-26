"""A multipart form read as one body: its text fields and its files together.

webargs reads the two from separate locations, and flask-smorest documents a
single request body per route; a photo comes with its text in one form.
"""
from webargs.flaskparser import FlaskParser
from webargs.multidictproxy import MultiDictProxy
from werkzeug.datastructures import CombinedMultiDict

LOCATION = 'multipart'


class Parser(FlaskParser):
    __location_map__ = {**FlaskParser.__location_map__, LOCATION: 'load_multipart'}

    def load_multipart(self, req, schema):
        return MultiDictProxy(CombinedMultiDict([req.form, req.files]), schema)
