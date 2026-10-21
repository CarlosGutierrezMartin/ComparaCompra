import pytest

from connectors.carrefour import CarrefourConnector
from connectors.http import BlockedError
from tests.conftest import fixture_response


def test_carrefour_bloqueada_no_se_salta(make_client):
    calls = []

    def router(request):
        calls.append(request.url)
        return fixture_response("carrefour", "blocked.html")

    c = CarrefourConnector(make_client("carrefour", router))
    with pytest.raises(BlockedError):
        c.listing(c.resolve_zone("28001"))
    assert len(calls) == 1
