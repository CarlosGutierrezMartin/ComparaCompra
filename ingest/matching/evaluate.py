"""Informe de precisión del emparejamiento sobre el conjunto de referencia (H2).

    uv run python -m matching.evaluate            # solo reglas
    uv run python -m matching.evaluate --llm      # reglas + IA (necesita ANTHROPIC_API_KEY)

Un nivel predicho es correcto si la relación real es al menos tan fuerte: dos productos
idénticos también son equivalentes y del mismo genérico.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path

from .llm import ClaudeLLM, available
from .matcher import Item, MatchResult, match

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "tests/fixtures/sample"
REFERENCE = ROOT / "tests/data/referencia_500.json"
LEVELS = ("identical", "equivalent", "generic", "distinct")
STRENGTH = {"identical": 3, "equivalent": 2, "generic": 1, "distinct": 0}
TARGET = 0.95


def load_items() -> list[Item]:
    items = []
    for path in sorted(SAMPLE.glob("*.json")):
        data = json.loads(path.read_text())
        for e in data["entries"]:
            p = e["product"]
            items.append(
                Item(
                    data["chain"],
                    p["external_id"],
                    p["name"],
                    p["brand"],
                    Decimal(p["quantity"]) if p["quantity"] else None,
                    p["unit"],
                    p["units_per_pack"],
                    p["category_ref"],
                )
            )
    return items


def predicted_level(result: MatchResult, a: tuple[str, str], b: tuple[str, str]) -> str:
    for level in ("identical", "equivalent", "generic"):
        ca, cb = result.canonical_of(a, level), result.canonical_of(b, level)
        if ca is not None and ca == cb:
            return level
    return "distinct"


def evaluate(result: MatchResult, pairs: list[dict]) -> dict:
    predicted: Counter[str] = Counter()
    correct: Counter[str] = Counter()
    gold_total: Counter[str] = Counter()
    gold_found: Counter[str] = Counter()
    errors = []
    for p in pairs:
        a = tuple(p["a"].split(":", 1))
        b = tuple(p["b"].split(":", 1))
        pred = predicted_level(result, a, b)  # type: ignore[arg-type]
        gold = p["label"]
        predicted[pred] += 1
        gold_total[gold] += 1
        ok = STRENGTH[gold] >= STRENGTH[pred] if pred != "distinct" else gold == "distinct"
        if ok:
            correct[pred] += 1
        else:
            errors.append(
                {"id": p["id"], "pred": pred, "gold": gold, "a": p["a_name"], "b": p["b_name"]}
            )
        if pred == gold:
            gold_found[gold] += 1
    return {
        "precision": {
            lv: (correct[lv] / predicted[lv] if predicted[lv] else None) for lv in LEVELS
        },
        "predicted": dict(predicted),
        "recall_exact": {
            lv: (gold_found[lv] / gold_total[lv] if gold_total[lv] else None) for lv in LEVELS
        },
        "gold": dict(gold_total),
        "errors": errors,
    }


def report(stats: dict) -> str:
    lines = [
        "| Nivel predicho | Pares | Precisión | Objetivo | Exhaustividad (nivel exacto) |",
        "| --- | --- | --- | --- | --- |",
    ]
    for lv in LEVELS:
        prec = stats["precision"][lv]
        rec = stats["recall_exact"][lv]
        goal = "—" if lv in ("generic", "distinct") else f"{TARGET:.0%}"
        lines.append(
            f"| {lv} | {stats['predicted'].get(lv, 0)} | "
            f"{'—' if prec is None else f'{prec:.1%}'} | {goal} | {'—' if rec is None else f'{rec:.1%}'} |"
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--llm", action="store_true", help="usar también la IA (ANTHROPIC_API_KEY)")
    parser.add_argument("--errors", action="store_true", help="listar los pares fallados")
    args = parser.parse_args()
    if args.llm and not available():
        raise SystemExit("Falta ANTHROPIC_API_KEY")
    result = match(load_items(), llm=ClaudeLLM() if args.llm else None)
    stats = evaluate(result, json.loads(REFERENCE.read_text())["pairs"])
    print(report(stats))
    if args.errors:
        for e in stats["errors"]:
            print(f"#{e['id']} pred={e['pred']} real={e['gold']}: {e['a']} || {e['b']}")


if __name__ == "__main__":
    main()
