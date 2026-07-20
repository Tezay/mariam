"""Upload hardening tests for StorageService.process_image."""
import io

import pytest
from PIL import Image

from app.services.storage import StorageService


def _jpeg_with_exif(caption='SECRET_CAPTION'):
    img = Image.new('RGB', (12, 12), 'red')
    exif = img.getexif()
    exif[0x010e] = caption  # ImageDescription
    buf = io.BytesIO()
    img.save(buf, format='JPEG', exif=exif)
    return buf.getvalue()


class TestProcessImage:
    def test_rejects_non_image(self):
        with pytest.raises(ValueError):
            StorageService.process_image(b'<html><script>x</script></html>', 'evil.jpg')

    def test_rejects_fake_extension(self):
        # A .png that is actually text must be rejected, not trusted by extension.
        with pytest.raises(ValueError):
            StorageService.process_image(b'not really a png', 'fake.png')

    def test_jpeg_reencoded_strips_exif(self):
        data, filename, content_type = StorageService.process_image(_jpeg_with_exif(), 'p.jpg')
        assert content_type == 'image/jpeg'
        assert filename.endswith('.jpg')
        assert b'SECRET_CAPTION' not in data

    def test_content_type_derived_not_trusted(self):
        # Client claims PNG but the bytes are JPEG → server derives image/jpeg.
        data, filename, content_type = StorageService.process_image(
            _jpeg_with_exif(), 'photo.png', 'image/png'
        )
        assert content_type == 'image/jpeg'

    def test_alpha_preserved_as_png(self):
        buf = io.BytesIO()
        Image.new('RGBA', (10, 10), (0, 0, 0, 0)).save(buf, format='PNG')
        data, filename, content_type = StorageService.process_image(buf.getvalue(), 'logo.png')
        assert content_type == 'image/png'
        assert filename.endswith('.png')
