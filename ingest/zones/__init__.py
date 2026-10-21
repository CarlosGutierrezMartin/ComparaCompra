"""Códigos postales cubiertos por la captura.

De momento solo Madrid capital (decisión del propietario, docs/DECISIONS.md):
el municipio de Madrid usa los códigos 28001 a 28055.
"""

CITIES: dict[str, list[str]] = {
    "madrid": [f"280{n:02d}" for n in range(1, 56)],
}
