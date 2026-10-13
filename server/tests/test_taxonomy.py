"""The taxonomy the server seeds, and what the client must know of it."""
import re
from pathlib import Path

import pytest

from app.data.taxonomy import DIETARY_TAGS

TAG_ICONS = Path(__file__).resolve().parents[2] / 'client/src/components/TagIcon.tsx'


@pytest.mark.skipif(not TAG_ICONS.exists(), reason='the client sources are not mounted here')
def test_the_client_lists_every_tag_icon():
    listed = set(re.findall(r"^  '?([a-z0-9-]+)'?: [A-Z]\w+,$", TAG_ICONS.read_text(), re.M))

    assert {tag['icon'] for tag in DIETARY_TAGS} <= listed
