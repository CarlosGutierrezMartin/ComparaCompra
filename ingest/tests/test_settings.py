from settings import USER_AGENT_DEFAULT, load_settings


def test_valores_por_defecto():
    s = load_settings({})
    assert s.user_agent == USER_AGENT_DEFAULT
    assert s.requests_per_minute == {"mercadona": 20, "carrefour": 20, "dia": 20, "alcampo": 20}


def test_limite_por_cadena():
    s = load_settings({"INGEST_RPM_DEFAULT": "10", "INGEST_RPM_DIA": "5"})
    assert s.requests_per_minute["dia"] == 5
    assert s.requests_per_minute["mercadona"] == 10
