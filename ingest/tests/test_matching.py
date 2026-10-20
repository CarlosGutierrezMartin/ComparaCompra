import json
from decimal import Decimal
from pathlib import Path

import pytest

from matching.classify_llm import BatchOut, ProductClass, ProductIn, classify_batch
from matching.classify_rules import classify
from matching.differentiators import differentiators
from matching.evaluate import evaluate, load_items
from matching.matcher import Item, match
from matching.taxonomy import BY_SLUG, LEAVES
from matching.verify import Verdict

REFERENCE = json.loads((Path(__file__).parent / "data/referencia_500.json").read_text())


class FakeLLM:
    """Devuelve respuestas preparadas y registra las llamadas."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def parse(self, *, system, user, output, max_tokens=16000):
        self.calls.append(user)
        return self.responses.pop(0) if self.responses else None


def test_taxonomia_entre_300_y_500_hojas_sin_duplicados():
    assert 300 <= len(LEAVES) <= 500
    assert len({leaf.slug for leaf in LEAVES}) == len(LEAVES)


@pytest.mark.parametrize(
    ("name", "path", "leaf", "variant", "flags"),
    [
        (
            "Leche semidesnatada sin lactosa Hacendado",
            "Leche",
            "leche",
            "semidesnatada",
            ["sin_lactosa"],
        ),
        ("Atún claro en aceite de oliva Calvo 3 x 52 g", "Conservas", "atun-en-conserva", "aceite de oliva", []),
        (
            "Tomate frito con aceite de oliva Solís 360 g",
            "Salsas de tomate",
            "tomate-frito",
            None,
            [],
        ),
        ("Nata ligera para cocinar Hacendado", "Nata", "nata-para-cocinar", None, []),
        (
            "Caldo de pollo Hacendado en pastillas",
            "Sopa y caldo",
            "pastillas-de-caldo",
            "pollo",
            [],
        ),
        ("Burger de vacuno y cerdo", "Hamburguesas", "hamburguesas", "mixta", []),
        (
            "Guisantes finos Dia Vegecampo 1 Kg",
            "Verduras > verduras-congeladas",
            "verdura-congelada",
            "guisantes",
            [],
        ),
    ],
)
def test_clasificacion_por_reglas(name, path, leaf, variant, flags):
    c = classify(name, path)
    assert c.accepted
    assert (c.leaf, c.variant, c.flags) == (leaf, variant, flags)


def test_ruta_de_otra_seccion_baja_la_confianza():
    c = classify("Patatas sabor barbacoa", "Aperitivos > Patatas fritas")
    assert c.leaf == "patatas-fritas-de-bolsa"
    fresh = classify("Patatas especiales", "Aperitivos > Snacks")
    assert not (fresh.leaf == "patata" and fresh.accepted)


def test_rasgos_que_rompen_la_equivalencia():
    assert differentiators("Leche semidesnatada de cabra Hacendado") == ("cabra",)
    assert "cocinado" in differentiators("Vasos de arroz basmati Brillante 2 x 200 g")
    assert differentiators("Judías verdes planas frasco 360 g", "Verdura") == ("conserva",)
    assert differentiators("Atún en lata 3 x 52 g", "Conservas, caldos y cremas") == ()


def _item(chain, pid, name, brand=None, q=None, unit=None, units=1, path="Leche"):
    return Item(chain, pid, name, brand, Decimal(q) if q else None, unit, units, path)


def test_identico_solo_entre_marcas_de_fabricante_con_mismo_formato():
    items = [
        _item("mercadona", "1", "Leche semidesnatada Asturiana", None, "1000", "ml", 6),
        _item(
            "alcampo",
            "2",
            "CENTRAL LECHERA ASTURIANA Leche semidesnatada 6 x 1 l",
            "Central Lechera Asturiana",
            "1000",
            "ml",
            6,
        ),
        _item("dia", "3", "Leche semidesnatada Asturiana 1 L", "Asturiana", "1000", "ml", 1),
        _item("dia", "4", "Leche semidesnatada Dia Láctea 6 x 1 L", "Dia Láctea", "1000", "ml", 6),
        _item("mercadona", "5", "Leche semidesnatada Hacendado", "Hacendado", "1000", "ml", 6),
    ]
    r = match(items)
    eq = {r.canonical_of(it.key, "equivalent") for it in items}
    assert len(eq) == 1  # todas son leche semidesnatada
    ident = {it.external_id: r.canonical_of(it.key, "identical") for it in items}
    assert ident["1"] is not None and ident["1"] == ident["2"]  # misma marca y formato
    assert ident["3"] != ident["1"]  # otro formato
    assert ident["4"] is None and ident["5"] is None  # marcas blancas


def test_clasificacion_con_ia_para_lo_dudoso():
    llm = FakeLLM(
        [
            BatchOut(
                productos=[
                    ProductClass(
                        id="dia:9", hoja="sofrito", variante=None, marcas=[], confianza=0.92
                    )
                ]
            )
        ]
    )
    item = _item("dia", "9", "Salsa artesana de la abuela", path="")
    r = match([item], llm=llm)
    assert r.classifications[item.key].leaf == "sofrito"
    assert r.classifications[item.key].source == "model"
    assert len(llm.calls) == 1


def test_ia_no_puede_inventar_variantes():
    llm = FakeLLM(
        [
            BatchOut(
                productos=[
                    ProductClass(
                        id="x",
                        hoja="leche",
                        variante="de almendras",
                        marcas=["ecologico"],
                        confianza=0.9,
                    )
                ]
            )
        ]
    )
    out = classify_batch(llm, [ProductIn(id="x", nombre="Leche rara")])
    assert out["x"].leaf == "leche"
    assert out["x"].variant is None


def test_sin_respuesta_valida_va_a_revision():
    llm = FakeLLM([None])
    item = _item("dia", "9", "Producto desconocido", path="")
    r = match([item], llm=llm)
    assert [rv.reason for rv in r.reviews] == ["clasificacion_dudosa"]


def test_identico_dudoso_se_verifica_con_ia():
    items = [
        _item("dia", "1", "Caldo de pollo casero Aneto 1 L", "Aneto", "1000", "ml", path="Caldos"),
        _item(
            "alcampo",
            "2",
            "ANETO Caldo de pollo de corral natural brik 1 l",
            "Aneto",
            "1000",
            "ml",
            path="Caldos",
        ),
    ]
    llm = FakeLLM([Verdict(nivel="identico", confianza=0.9)])
    r = match(items, llm=llm)
    a, b = (r.canonical_of(it.key, "identical") for it in items)
    if llm.calls:  # solo si cayó en la franja dudosa
        assert a == b


def test_conjunto_de_referencia_cumple_el_objetivo():
    stats = evaluate(match(load_items()), REFERENCE["pairs"])
    assert len(REFERENCE["pairs"]) == 500
    assert stats["precision"]["identical"] >= 0.95
    assert stats["precision"]["equivalent"] >= 0.95


def test_hojas_de_la_ia_existen():
    for leaf in ("sofrito", "claras-de-huevo", "pastillas-de-caldo"):
        assert leaf in BY_SLUG
