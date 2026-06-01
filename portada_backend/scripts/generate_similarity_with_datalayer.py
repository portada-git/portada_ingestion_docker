"""
Genera resultados de similitud usando py-portada-data-layer para leer datos.

Este script NO sustituye al flujo actual. Es una variante aparte para validar
qué ocurre si la extracción de entradas y entidades conocidas pasa por
BoatFactCleaning en vez de usar Spark directo + /app/known_entities.json.
"""

from __future__ import annotations

import argparse
import json
import importlib.util
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


DEFAULT_DATA_LAYER_CONFIG_PATH = "/app/config/delta_data_layer_config.json"
DEFAULT_SIMILARITY_CONFIG_PATH = "/app/config/config_similarity.json"
DEFAULT_SCHEMA_PATH = "/app/config/schema.json"
DEFAULT_MAPPING_PATH = "/app/config/mapping_to_clean_chars.json"
DEFAULT_OUTPUT_DIR = "/app/similarity_results"
DEFAULT_KNOWN_ENTITIES_PATH = "/app/known_entities.json"

ENTITIES = [
    "port",
    "ship_type",
    "flag",
    "ship_tons",
    "travel_duration",
    "master_role",
    "comodity",
    "unit",
]


def read_json(path: str | Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def disable_unavailable_optional_algorithms(
    similarity_config: dict[str, Any],
    available_modules: dict[str, bool] | None = None,
) -> list[str]:
    """Desactiva algoritmos opcionales cuando falta su dependencia Python."""
    if available_modules is None:
        available_modules = {
            "text2vec": importlib.util.find_spec("text2vec") is not None,
            "sentence_transformers": importlib.util.find_spec("sentence_transformers") is not None,
            "fasttext": importlib.util.find_spec("fasttext") is not None,
        }

    dependency_by_algorithm = {
        "semantic_text2vec": "text2vec",
        "sentence_transformer_LABSE": "sentence_transformers",
        "sentence_transformer_labse": "sentence_transformers",
        "sentence_transformer_mpnet": "sentence_transformers",
        "fasttext": "fasttext",
    }

    disabled: list[str] = []
    algorithms = similarity_config.get("algorithms", {})
    for algorithm_name, dependency_name in dependency_by_algorithm.items():
        algorithm_config = algorithms.get(algorithm_name)
        if not algorithm_config or not algorithm_config.get("enabled"):
            continue
        if not available_modules.get(dependency_name, False):
            algorithm_config["enabled"] = False
            algorithm_config["disabled_reason"] = f"Dependencia opcional no instalada: {dependency_name}"
            disabled.append(algorithm_name)

    return disabled


def build_layer(
    data_layer_config_path: str,
    schema_path: str | None = None,
    mapping_path: str | None = None,
):
    from portada_data_layer import PortadaBuilder
    from portada_data_layer.portada_cleaning import BoatFactCleaning

    config_layer = read_json(data_layer_config_path)
    builder = PortadaBuilder(config_layer)
    layer = BoatFactCleaning(builder=builder)
    layer.start_session()

    if schema_path and Path(schema_path).exists():
        layer.use_schema(read_json(schema_path))
    if mapping_path and Path(mapping_path).exists():
        layer.use_mapping_to_clean_chars(read_json(mapping_path))

    return layer


def _row_to_dict(row: Any) -> dict[str, Any]:
    if hasattr(row, "asDict"):
        return row.asDict(True)
    if isinstance(row, dict):
        return row
    return dict(row)


def collect_known_voices(
    layer: Any,
    entity_name: str,
    fallback_known_entities_path: str | Path | None = DEFAULT_KNOWN_ENTITIES_PATH,
) -> dict[str, list[str]]:
    """Lee voces conocidas desde Delta y cae a JSON si esa entidad no existe all?."""
    voices: dict[str, list[str]] = {}

    try:
        df_entities = layer.read_raw_entities(entity_name)
        if df_entities is not None and df_entities.count() > 0:
            df_known = layer.get_known_entity_voices(df_entities=df_entities)
            for row in df_known.collect():
                data = _row_to_dict(row)
                canonical = str(data.get("name", "")).strip()
                voice = str(data.get("voice", "")).strip()
                if canonical and voice and voice.lower() not in {"null", "none"}:
                    voices.setdefault(canonical, [])
                    if voice not in voices[canonical]:
                        voices[canonical].append(voice)
    except Exception as exc:
        print(f"[WARN] No se pudieron leer entidades '{entity_name}' desde Delta: {exc}")

    if voices or not fallback_known_entities_path:
        return voices

    fallback_path = Path(fallback_known_entities_path)
    if not fallback_path.exists():
        return voices

    known_entities = read_json(fallback_path)
    known_data = known_entities.get(entity_name, {})
    if not isinstance(known_data, dict):
        return voices

    for canonical, raw_voices in known_data.items():
        canonical_clean = str(canonical).strip()
        if not canonical_clean:
            continue
        if isinstance(raw_voices, list):
            cleaned_voices = [str(v).strip() for v in raw_voices if str(v).strip()]
        elif raw_voices:
            cleaned_voices = [str(raw_voices).strip()]
        else:
            cleaned_voices = []
        if cleaned_voices:
            voices[canonical_clean] = list(dict.fromkeys(cleaned_voices))

    return voices


def _counter_from_rows(rows: Iterable[Any], field: str = "citation") -> Counter:
    counter: Counter = Counter()
    for row in rows:
        data = _row_to_dict(row)
        citation = data.get(field)
        if citation is None and data:
            citation = next(iter(data.values()))
        citation = "" if citation is None else str(citation).strip()
        if citation and citation.lower() not in {"null", "none", "n/a"}:
            counter[citation] += 1
    return counter


def collect_citations(layer: Any, df_entries: Any, entity_name: str) -> Counter:
    """Extrae citaciones usando métodos de BoatFactCleaning siempre que existan."""
    if entity_name == "port":
        df_citations = layer.extract_ports(df_entries, from_port_of_calls=False, from_arrival_port=False)
    elif entity_name == "ship_type":
        df_citations = layer.extract_ship_types(df_entries)
    elif entity_name == "flag":
        df_citations = layer.extract_ship_flags(df_entries)
    elif entity_name == "ship_tons":
        df_citations = layer.extract_ship_tons_units(df_entries)
    elif entity_name == "master_role":
        df_citations = layer.extract_master_roles(df_entries)
    elif entity_name == "comodity":
        df_cargo = layer.extract_cargo_comodities_and_units(df_entries)
        df_citations = df_cargo.filter("cargo_commodity_citation IS NOT NULL").selectExpr(
            "cargo_commodity_citation as citation"
        )
    elif entity_name == "unit":
        df_cargo = layer.extract_cargo_comodities_and_units(df_entries)
        df_citations = df_cargo.filter("cargo_unit_citation IS NOT NULL").selectExpr(
            "cargo_unit_citation as citation"
        )
    elif entity_name == "travel_duration" and hasattr(layer, "extract_travel_durations"):
        df_citations = layer.extract_travel_durations(df_entries)
    elif entity_name == "travel_duration":
        # La versión analizada de py-portada-data-layer no expone extractor dedicado.
        # Seguimos leyendo el DataFrame desde la capa, pero seleccionamos los campos
        # conocidos para no perder cobertura de esta entidad.
        candidate_fields = [
            "travel_duration_unit",
            "travel_duration_value",
            "travel_duration_unit_detailed_value",
            "travel_duration_value_detailed_value",
        ]
        available = set(getattr(df_entries, "columns", []))
        for field in candidate_fields:
            if field in available:
                df_citations = df_entries.selectExpr(f"{field} as citation")
                break
        else:
            return Counter()
    else:
        raise ValueError(f"Entidad no soportada: {entity_name}")

    if df_citations is None or df_citations.count() == 0:
        return Counter()
    return _counter_from_rows(df_citations.collect())


def clean_entries_for_similarity(layer: Any, df_entries: Any) -> Any:
    """Aplica el pipeline de limpieza de BoatFactCleaning antes de extraer citaciones."""
    cleaned = layer.cleaning_entries(df_entries, saving_original_data=False)
    return layer.normalize_strings_for_ship_entries(cleaned)


def run_similarity_generation(
    layer: Any,
    service: Any,
    voice_list_factory: Any,
    entities: list[str] | None = None,
    fallback_known_entities_path: str | Path | None = DEFAULT_KNOWN_ENTITIES_PATH,
) -> dict[str, Any]:
    df_entries = layer.read_raw_entries()
    if df_entries is None:
        raise RuntimeError("No se pudieron leer entradas RAW desde py-portada-data-layer")

    df_entries = clean_entries_for_similarity(layer, df_entries)
    entry_count = df_entries.count()
    all_results = {
        "timestamp": datetime.now().isoformat(),
        "source": "py-portada-data-layer",
        "total_entries": entry_count,
        "entities": {},
    }

    for entity_name in entities or ENTITIES:
        entity_result = {
            "name": entity_name,
            "status": "pending",
            "known_voices": 0,
            "unique_terms": 0,
            "total_citations": 0,
            "coverage": 0.0,
            "results": [],
        }

        try:
            voices_dict = collect_known_voices(layer, entity_name, fallback_known_entities_path)
            entity_result["known_voices"] = len(voices_dict)
            if not voices_dict:
                entity_result["status"] = "no_known_entities"
                all_results["entities"][entity_name] = entity_result
                continue

            citations_counter = collect_citations(layer, df_entries, entity_name)
            if not citations_counter:
                entity_result["status"] = "no_citations"
                all_results["entities"][entity_name] = entity_result
                continue

            terms_input = [{"term": term, "frequency": freq} for term, freq in citations_counter.items()]
            voice_list = voice_list_factory.from_dict(entity_type=entity_name, data=voices_dict)
            results_list = service.evaluate(terms_input, voice_list)

            total_freq = sum(r.get("frequency", 0) for r in results_list)
            resolved_freq = sum(
                r.get("frequency", 0)
                for r in results_list
                if r.get("classification") in {"EXACT", "CONSENSUS"}
            )

            entity_result["unique_terms"] = len(terms_input)
            entity_result["total_citations"] = sum(citations_counter.values())
            entity_result["coverage"] = round((resolved_freq / total_freq * 100) if total_freq else 0, 2)
            entity_result["status"] = "success"
            entity_result["results"] = results_list
        except Exception as exc:
            entity_result["status"] = "error"
            entity_result["error"] = str(exc)[:300]

        all_results["entities"][entity_name] = entity_result

    return all_results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genera similitudes usando py-portada-data-layer")
    parser.add_argument("--data-layer-config", default=DEFAULT_DATA_LAYER_CONFIG_PATH)
    parser.add_argument("--similarity-config", default=DEFAULT_SIMILARITY_CONFIG_PATH)
    parser.add_argument("--schema", default=DEFAULT_SCHEMA_PATH)
    parser.add_argument("--mapping", default=DEFAULT_MAPPING_PATH)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--output-file", default="similarity_results_datalayer.json")
    parser.add_argument("--known-entities", default=DEFAULT_KNOWN_ENTITIES_PATH)
    parser.add_argument("--entities", nargs="*", default=ENTITIES)
    return parser.parse_args()


def main() -> int:
    from portada_s_index import SimilarityService, VoiceList

    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("GENERACIÓN DE SIMILITUDES CON py-portada-data-layer")
    print("=" * 80)

    layer = build_layer(args.data_layer_config, args.schema, args.mapping)
    similarity_config = read_json(args.similarity_config)
    disabled_algorithms = disable_unavailable_optional_algorithms(similarity_config)
    if disabled_algorithms:
        print(f"[WARN] Algoritmos opcionales desactivados por dependencias faltantes: {disabled_algorithms}")
    service = SimilarityService.from_dict(similarity_config)
    results = run_similarity_generation(layer, service, VoiceList, args.entities, args.known_entities)
    results["disabled_algorithms"] = disabled_algorithms

    output_path = output_dir / args.output_file
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    if getattr(layer, "spark", None) is not None:
        layer.stop_session()

    print(f"Resultados guardados en: {output_path}")
    print("=" * 80)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
