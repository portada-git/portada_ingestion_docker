"""
Genera resultados de similitud usando py-portada-data-layer y escribe un log.txt
con información clave para depurar casos raros en semantic_model.

Este script es una variante de inspección: conserva el JSON final y además
deja trazas útiles sobre entradas, voces, normalización y scores.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import logging
import os
import re
import time
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


DEFAULT_DATA_LAYER_CONFIG_PATH = "/app/config/delta_data_layer_config.json"
DEFAULT_SIMILARITY_CONFIG_PATH = "/app/config/config_similarity.json"
DEFAULT_SCHEMA_PATH = "/app/config/schema.json"
DEFAULT_MAPPING_PATH = "/app/config/mapping_to_clean_chars.json"
DEFAULT_OUTPUT_DIR = "/tmp/similarity_results"
DEFAULT_OUTPUT_FILE = "similarity_results_datalayer.json"
DEFAULT_LOG_FILE = "log.txt"
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


def setup_logger(log_path: Path) -> logging.Logger:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("similarity_datalayer_log")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    logger.propagate = False

    formatter = logging.Formatter("[%(asctime)s] %(message)s", datefmt="%H:%M:%S")
    file_handler = logging.FileHandler(log_path, mode="w", encoding="utf-8")
    file_handler.setFormatter(formatter)
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)
    return logger


def read_json(path: str | Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def format_seconds(start_time: float) -> str:
    return f"{time.perf_counter() - start_time:.1f}s"


def disable_unavailable_optional_algorithms(
    similarity_config: dict[str, Any],
    available_modules: dict[str, bool] | None = None,
    logger: logging.Logger | None = None,
) -> list[str]:
    if logger:
        logger.info("Verificando dependencias opcionales de algoritmos")
    if available_modules is None:
        available_modules = {
            "text2vec": importlib.util.find_spec("text2vec") is not None,
            "sentence_transformers": importlib.util.find_spec("sentence_transformers") is not None,
            "fasttext": importlib.util.find_spec("fasttext") is not None,
            "transformers": importlib.util.find_spec("transformers") is not None,
            "torch": importlib.util.find_spec("torch") is not None,
        }
    if logger:
        logger.info("Dependencias detectadas: %s", available_modules)

    dependency_by_algorithm = {
        "semantic_text2vec": "text2vec",
        "sentence_transformer_LABSE": "sentence_transformers",
        "sentence_transformer_labse": "sentence_transformers",
        "sentence_transformer_mpnet": "sentence_transformers",
        "fasttext": "fasttext",
        "byt5": "byt5",
    }

    disabled: list[str] = []
    algorithms = similarity_config.get("algorithms", {})

    def disable_algorithm(algorithm_name: str, reason: str) -> None:
        algorithm_config = algorithms.get(algorithm_name)
        if algorithm_config is not None:
            algorithm_config["enabled"] = False
            algorithm_config["disabled_reason"] = reason
        if similarity_config.get("algorithm_per_entity"):
            algorithms.pop(algorithm_name, None)
            for names in similarity_config["algorithm_per_entity"].values():
                while algorithm_name in names:
                    names.remove(algorithm_name)
        if algorithm_name not in disabled:
            disabled.append(algorithm_name)
        if logger:
            logger.info("Desactivado %s: %s", algorithm_name, reason)

    for algorithm_name, dependency_name in dependency_by_algorithm.items():
        algorithm_config = algorithms.get(algorithm_name)
        if not algorithm_config:
            continue
        dependency_available = (
            available_modules.get("transformers", False)
            and available_modules.get("torch", False)
            if dependency_name == "byt5"
            else available_modules.get(dependency_name, False)
        )
        if not dependency_available:
            disable_algorithm(
                algorithm_name,
                f"Dependencia opcional no instalada: {dependency_name}",
            )

    if "semantic_model" in algorithms and not (
        available_modules.get("text2vec", False)
        or available_modules.get("sentence_transformers", False)
    ):
        disable_algorithm(
            "semantic_model",
            "Dependencia opcional no instalada: text2vec o sentence_transformers",
        )

    fasttext_config = algorithms.get("fasttext")
    if fasttext_config:
        model_path = fasttext_config.get("params", {}).get("model_path")
        if model_path:
            candidates = [Path(model_path), Path("/app") / model_path]
            if not any(candidate.exists() for candidate in candidates):
                disable_algorithm("fasttext", f"Modelo FastText no encontrado: {model_path}")

    return disabled


def normalize_runtime_devices(
    similarity_config: dict[str, Any],
    logger: logging.Logger | None = None,
    cuda_available: bool | None = None,
) -> list[str]:
    if cuda_available is None:
        try:
            import torch

            cuda_available = bool(torch.cuda.is_available())
        except Exception:
            cuda_available = False

    if cuda_available:
        return []

    changes: list[str] = []
    algorithms = similarity_config.get("algorithms", {})

    for algorithm_name in ("byt5", "semantic_model"):
        params = algorithms.get(algorithm_name, {}).get("params", {})
        if params.get("device") == "cuda":
            params["device"] = "cpu"
            changes.append(f"{algorithm_name}.device cuda->cpu")

    byt5_params = algorithms.get("byt5", {}).get("params", {})
    if str(byt5_params.get("torch_dtype", "")).lower() in {"bfloat16", "bf16", "float16", "fp16"}:
        old_dtype = byt5_params.get("torch_dtype")
        byt5_params["torch_dtype"] = "float32"
        changes.append(f"byt5.torch_dtype {old_dtype}->float32")

    if logger and changes:
        logger.info("Ajustes por runtime sin CUDA: %s", changes)
    return changes


def _row_to_dict(row: Any) -> dict[str, Any]:
    if hasattr(row, "asDict"):
        return row.asDict(True)
    if isinstance(row, dict):
        return row
    return dict(row)


def normalize_text_preview(text: str) -> str:
    return text.replace("\n", " ").strip()


def collect_known_voices(
    layer: Any,
    entity_name: str,
    logger: logging.Logger,
    fallback_known_entities_path: str | Path | None = DEFAULT_KNOWN_ENTITIES_PATH,
) -> dict[str, list[str]]:
    logger.info("[%s] Leyendo voces conocidas", entity_name)
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
        logger.info("[WARN] No se pudieron leer entidades '%s' desde Delta: %s", entity_name, exc)

    if voices or not fallback_known_entities_path:
        logger.info("[%s] Voces conocidas cargadas: %d", entity_name, len(voices))
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

    logger.info("[%s] Voces conocidas cargadas desde fallback: %d", entity_name, len(voices))
    return voices


DOCUMENT_ID_PATTERN = re.compile(r"^DM_\d+$", re.IGNORECASE)
SHIP_TYPE_TOKEN_PATTERN = re.compile(
    r"\b(berg(?:antin)?|frag(?:ata)?|gol(?:eta)?|paq(?:uete)?|vapor|pol(?:acra)?|bric|barca|balandra|pailebot|mistico|lugre|zumaca)\b",
    re.IGNORECASE,
)
MASTER_ROLE_TOKEN_PATTERN = re.compile(
    r"\b(teniente|capitan|cap\.?|patron|maestre|piloto|contramaestre|alferez)\b",
    re.IGNORECASE,
)


def normalize_citation_for_entity(entity_name: str, citation: str) -> str:
    cleaned = citation.strip().strip(".,;:")
    if not cleaned or DOCUMENT_ID_PATTERN.match(cleaned):
        return ""

    if entity_name == "ship_type":
        lowered = cleaned.lower()
        if MASTER_ROLE_TOKEN_PATTERN.search(lowered) and not SHIP_TYPE_TOKEN_PATTERN.search(lowered):
            return ""
        if lowered.startswith(("del ", "de la ", "de el ", "segundo ", "primer ")):
            match = SHIP_TYPE_TOKEN_PATTERN.search(lowered)
            if match:
                return match.group(1)
    return cleaned


def _counter_from_rows(
    rows: Iterable[Any],
    field: str = "citation",
    entity_name: str = "",
) -> Counter:
    counter: Counter = Counter()
    for row in rows:
        data = _row_to_dict(row)
        citation = data.get(field)
        if citation is None and data:
            citation = next(iter(data.values()))
        citation = "" if citation is None else str(citation).strip()
        citation = normalize_citation_for_entity(entity_name, citation)
        if citation and citation.lower() not in {"null", "none", "n/a"}:
            counter[citation] += 1
    return counter


def collect_citations(layer: Any, df_entries: Any, entity_name: str, logger: logging.Logger) -> Counter:
    logger.info("[%s] Extrayendo citaciones", entity_name)
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
        logger.info("[%s] Sin citaciones", entity_name)
        return Counter()

    counter = _counter_from_rows(df_citations.collect(), entity_name=entity_name)
    logger.info(
        "[%s] Citaciones extraídas: %d totales, %d únicas",
        entity_name,
        sum(counter.values()),
        len(counter),
    )
    return counter


def clean_entries_for_similarity(layer: Any, df_entries: Any, logger: logging.Logger) -> Any:
    logger.info("Aplicando limpieza BoatFactCleaning en memoria")
    cleaned = layer.cleaning_entries(df_entries, saving_original_data=False)
    logger.info("Normalizando strings de entradas limpias")
    normalized = layer.normalize_strings_for_ship_entries(cleaned)
    return normalized


def build_layer(data_layer_config_path: str, schema_path: str | None, mapping_path: str | None, logger: logging.Logger):
    logger.info("Inicializando data-layer con config: %s", data_layer_config_path)
    from portada_data_layer import PortadaBuilder
    from portada_data_layer.portada_cleaning import BoatFactCleaning

    config_layer = read_json(data_layer_config_path)
    builder = PortadaBuilder(config_layer)
    layer = BoatFactCleaning(builder=builder)
    redis_host = os.getenv("REDIS_HOST")
    redis_port = os.getenv("REDIS_PORT")
    redis_db = int(os.getenv("REDIS_DB", "3"))
    if redis_host and redis_port and hasattr(layer, "set_redis_params"):
        logger.info("Configurando metadata Redis para data-layer: %s:%s/%s", redis_host, redis_port, redis_db)
        layer.set_redis_params(host=redis_host, port=int(redis_port), db=redis_db)
    elif hasattr(builder, "use_redis_metadata"):
        logger.info("Redis no configurado; desactivando metadata Redis para ejecución local")
        builder.use_redis_metadata(False)
    logger.info("Arrancando sesión Spark/data-layer")
    layer.start_session()

    if schema_path and Path(schema_path).exists():
        logger.info("Cargando schema de limpieza: %s", schema_path)
        layer.use_schema(read_json(schema_path))
    if mapping_path and Path(mapping_path).exists():
        logger.info("Cargando mapping de limpieza: %s", mapping_path)
        layer.use_mapping_to_clean_chars(read_json(mapping_path))

    return layer


def get_available_algorithms(service: Any) -> list[str]:
    return list(getattr(service, "active_algorithms", []))


def get_allowed_algorithms(service: Any, entity_name: str) -> list[str]:
    config = getattr(service, "config", None)
    if config and hasattr(config, "allowed_names_for_entity"):
        return list(config.allowed_names_for_entity(entity_name))
    return []


def run_similarity_generation(
    layer: Any,
    service: Any,
    voice_list_factory: Any,
    entities: list[str] | None,
    logger: logging.Logger,
    fallback_known_entities_path: str | Path | None = DEFAULT_KNOWN_ENTITIES_PATH,
) -> dict[str, Any]:
    logger.info("Leyendo entradas RAW desde py-portada-data-layer")
    df_entries = layer.read_raw_entries(force_all=True)
    if df_entries is None:
        raise RuntimeError("No se pudieron leer entradas RAW desde py-portada-data-layer")

    df_entries = clean_entries_for_similarity(layer, df_entries, logger)
    entry_count = df_entries.count()
    logger.info("Entradas listas para similitud: %d", entry_count)

    all_results = {
        "timestamp": datetime.now().isoformat(),
        "source": "py-portada-data-layer",
        "total_entries": entry_count,
        "entities": {},
    }

    selected_entities = entities or ENTITIES
    logger.info("Entidades a procesar: %s", selected_entities)

    for entity_idx, entity_name in enumerate(selected_entities, start=1):
        entity_start = time.perf_counter()
        logger.info("[%d/%d] Iniciando entidad: %s", entity_idx, len(selected_entities), entity_name)
        entity_result = {
            "name": entity_name,
            "status": "pending",
            "known_voices": 0,
            "unique_terms": 0,
            "total_citations": 0,
            "available_algorithms": get_available_algorithms(service),
            "allowed_algorithms": get_allowed_algorithms(service, entity_name),
            "results": [],
        }

        try:
            voices_dict = collect_known_voices(layer, entity_name, logger, fallback_known_entities_path)
            entity_result["known_voices"] = len(voices_dict)
            if not voices_dict:
                entity_result["status"] = "no_known_entities"
                all_results["entities"][entity_name] = entity_result
                logger.info("[%s] Saltada: %s", entity_name, entity_result["status"])
                continue

            citations_counter = collect_citations(layer, df_entries, entity_name, logger)
            if not citations_counter:
                entity_result["status"] = "no_citations"
                all_results["entities"][entity_name] = entity_result
                logger.info("[%s] Saltada: %s", entity_name, entity_result["status"])
                continue

            terms_input = [{"term": term, "frequency": freq} for term, freq in citations_counter.items()]
            voice_list = voice_list_factory.from_dict(entity_type=entity_name, data=voices_dict)

            logger.info(
                "[%s] voice_list=%d canonicals, terms=%d",
                entity_name,
                len(voices_dict),
                len(terms_input),
            )
            logger.info("[%s] Muestra terms: %s", entity_name, [x["term"] for x in terms_input[:10]])
            logger.info(
                "[%s] Muestra voces: %s",
                entity_name,
                {k: v[:5] for k, v in list(voices_dict.items())[:5]},
            )

            results_list = service.evaluate(terms_input, voice_list)
            logger.info("[%s] evaluate completado con %d resultados", entity_name, len(results_list))

            sem_rows = [r for r in results_list if isinstance(r, dict) and r.get("algorithm") == "semantic_model"]
            logger.info("[%s] semantic_model resultados: %d", entity_name, len(sem_rows))
            for row in sem_rows[:10]:
                logger.info(
                    "[%s][semantic_model] term=%s best_voice=%s best_entity=%s score=%s voted=%s gray=%s",
                    entity_name,
                    row.get("term"),
                    row.get("best_voice"),
                    row.get("best_entity"),
                    row.get("score"),
                    row.get("voted"),
                    row.get("in_gray_zone"),
                )

            entity_result["unique_terms"] = len(terms_input)
            entity_result["total_citations"] = sum(citations_counter.values())
            entity_result["status"] = "success"
            entity_result["results"] = results_list
            logger.info("[%s] OK raw_results=%d (%s)", entity_name, len(results_list), format_seconds(entity_start))
        except Exception as exc:
            entity_result["status"] = "error"
            entity_result["error"] = str(exc)[:300]
            logger.info("[%s] ERROR: %s (%s)", entity_name, entity_result["error"], format_seconds(entity_start))

        all_results["entities"][entity_name] = entity_result

    return all_results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genera similitudes usando py-portada-data-layer con log detallado")
    parser.add_argument("--data-layer-config", default=DEFAULT_DATA_LAYER_CONFIG_PATH)
    parser.add_argument("--similarity-config", default=DEFAULT_SIMILARITY_CONFIG_PATH)
    parser.add_argument("--schema", default=DEFAULT_SCHEMA_PATH)
    parser.add_argument("--mapping", default=DEFAULT_MAPPING_PATH)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--output-file", default=DEFAULT_OUTPUT_FILE)
    parser.add_argument("--log-file", default=DEFAULT_LOG_FILE)
    parser.add_argument("--known-entities", default=DEFAULT_KNOWN_ENTITIES_PATH)
    parser.add_argument("--entities", nargs="*", default=ENTITIES)
    return parser.parse_args()


def main() -> int:
    from portada_s_index import SimilarityService, VoiceList

    script_start = time.perf_counter()
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / args.log_file
    logger = setup_logger(log_path)

    logger.info("=" * 80)
    logger.info("GENERACIÓN DE SIMILITUDES CON py-portada-data-layer")
    logger.info("Output JSON: %s", output_dir / args.output_file)
    logger.info("Log file: %s", log_path)
    logger.info("=" * 80)

    layer = build_layer(args.data_layer_config, args.schema, args.mapping, logger)
    logger.info("Cargando config de similitud: %s", args.similarity_config)
    similarity_config = read_json(args.similarity_config)
    disabled_algorithms = disable_unavailable_optional_algorithms(similarity_config, logger=logger)
    runtime_device_changes = normalize_runtime_devices(similarity_config, logger=logger)
    service = SimilarityService.from_dict(similarity_config)
    logger.info("Algoritmos activos: %s", get_available_algorithms(service))

    results = run_similarity_generation(
        layer=layer,
        service=service,
        voice_list_factory=VoiceList,
        entities=args.entities,
        logger=logger,
        fallback_known_entities_path=args.known_entities,
    )
    results["disabled_algorithms"] = disabled_algorithms
    results["runtime_device_changes"] = runtime_device_changes

    output_path = output_dir / args.output_file
    temp_output_path = output_path.with_suffix(f"{output_path.suffix}.tmp")
    logger.info("Escribiendo JSON final: %s", output_path)
    with open(temp_output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        f.write("\n")
    temp_output_path.replace(output_path)
    logger.info("JSON final escrito: %s", output_path)

    if getattr(layer, "spark", None) is not None:
        logger.info("Cerrando sesión Spark")
        layer.stop_session()

    logger.info("Proceso completo en %s", format_seconds(script_start))
    logger.info("=" * 80)
    print(f"Resultados guardados en: {output_path}")
    print(f"Log guardado en: {log_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
