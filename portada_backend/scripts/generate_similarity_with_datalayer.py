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


def log_step(message: str) -> None:
    """Log de progreso visible en tiempo real dentro de Docker."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}", flush=True)


def format_seconds(start_time: float) -> str:
    return f"{time.perf_counter() - start_time:.1f}s"


def read_json(path: str | Path) -> dict[str, Any]:
    # Lectura JSON centralizada para evitar duplicación.
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def disable_unavailable_optional_algorithms(
    similarity_config: dict[str, Any],
    available_modules: dict[str, bool] | None = None,
) -> list[str]:
    """Desactiva algoritmos opcionales cuando falta su dependencia Python."""
    log_step("Verificando dependencias opcionales de algoritmos")
    if available_modules is None:
        available_modules = {
            "text2vec": importlib.util.find_spec("text2vec") is not None,
            "sentence_transformers": importlib.util.find_spec("sentence_transformers") is not None,
            "fasttext": importlib.util.find_spec("fasttext") is not None,
            "transformers": importlib.util.find_spec("transformers") is not None,
            "torch": importlib.util.find_spec("torch") is not None,
        }
    log_step(f"Dependencias detectadas: {available_modules}")

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
    # Si falta dependencia opcional, desactivamos ese algoritmo para no romper evaluate().
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
            algorithm_config["enabled"] = False
            algorithm_config["disabled_reason"] = f"Dependencia opcional no instalada: {dependency_name}"
            if similarity_config.get("algorithm_per_entity"):
                algorithms.pop(algorithm_name, None)
                for names in similarity_config["algorithm_per_entity"].values():
                    while algorithm_name in names:
                        names.remove(algorithm_name)
            disabled.append(algorithm_name)

    if "semantic_model" in algorithms and not (
        available_modules.get("text2vec", False)
        or available_modules.get("sentence_transformers", False)
    ):
        algorithms["semantic_model"]["enabled"] = False
        algorithms["semantic_model"]["disabled_reason"] = (
            "Dependencia opcional no instalada: text2vec o sentence_transformers"
        )
        if similarity_config.get("algorithm_per_entity"):
            algorithms.pop("semantic_model", None)
            for names in similarity_config["algorithm_per_entity"].values():
                while "semantic_model" in names:
                    names.remove("semantic_model")
        disabled.append("semantic_model")

    return disabled


def normalize_runtime_devices(
    similarity_config: dict[str, Any],
    cuda_available: bool | None = None,
) -> list[str]:
    """Ajusta dispositivos de modelos Torch al runtime real del contenedor."""
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

    return changes


def get_available_algorithms(service: Any) -> list[str]:
    return list(getattr(service, "active_algorithms", []))


def get_allowed_algorithms(service: Any, entity_name: str) -> list[str]:
    config = getattr(service, "config", None)
    if config and hasattr(config, "allowed_names_for_entity"):
        return list(config.allowed_names_for_entity(entity_name))
    return []


def build_layer(
    data_layer_config_path: str,
    schema_path: str | None = None,
    mapping_path: str | None = None,
):
    # Inicializa py-portada-data-layer + BoatFactCleaning + sesión Spark.
    step_start = time.perf_counter()
    log_step(f"Inicializando data-layer con config: {data_layer_config_path}")
    from portada_data_layer import PortadaBuilder
    from portada_data_layer.portada_cleaning import BoatFactCleaning

    config_layer = read_json(data_layer_config_path)
    builder = PortadaBuilder(config_layer)
    layer = BoatFactCleaning(builder=builder)
    log_step("Arrancando sesión Spark/data-layer")
    layer.start_session()

    if schema_path and Path(schema_path).exists():
        log_step(f"Cargando schema de limpieza: {schema_path}")
        layer.use_schema(read_json(schema_path))
    if mapping_path and Path(mapping_path).exists():
        log_step(f"Cargando mapping de limpieza: {mapping_path}")
        layer.use_mapping_to_clean_chars(read_json(mapping_path))

    return layer


def _row_to_dict(row: Any) -> dict[str, Any]:
    # Unifica Row/dict a dict.
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
    """Lee voces conocidas desde Delta y recurre a JSON de fallback si la entidad no existe."""
    step_start = time.perf_counter()
    log_step(f"[{entity_name}] Leyendo voces conocidas")
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
        log_step(f"[{entity_name}] Voces conocidas cargadas: {len(voices)} ({format_seconds(step_start)})")
        return voices

    log_step(f"[{entity_name}] Usando fallback de voces conocidas si hace falta: {fallback_known_entities_path}")
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
    # Calcula frecuencia por citación (la usa SimilarityService).
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
    step_start = time.perf_counter()
    log_step(f"[{entity_name}] Extrayendo citaciones")
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
        log_step(f"[{entity_name}] Sin citaciones ({format_seconds(step_start)})")
        return Counter()
    counter = _counter_from_rows(df_citations.collect())
    log_step(f"[{entity_name}] Citaciones extraídas: {sum(counter.values())} totales, {len(counter)} únicas ({format_seconds(step_start)})")
    return counter


def clean_entries_for_similarity(layer: Any, df_entries: Any) -> Any:
    """Aplica el pipeline de limpieza de BoatFactCleaning antes de extraer citaciones."""
    # Importante: limpieza en memoria; NO persiste bronze/clean en este script.
    step_start = time.perf_counter()
    log_step("Aplicando limpieza BoatFactCleaning en memoria")
    cleaned = layer.cleaning_entries(df_entries, saving_original_data=False)
    log_step("Normalizando strings de entradas limpias")
    normalized = layer.normalize_strings_for_ship_entries(cleaned)
    log_step(f"Limpieza en memoria completada en {format_seconds(step_start)}")
    return normalized


def run_similarity_generation(
    layer: Any,
    service: Any,
    voice_list_factory: Any,
    entities: list[str] | None = None,
    fallback_known_entities_path: str | Path | None = DEFAULT_KNOWN_ENTITIES_PATH,
) -> dict[str, Any]:
    run_start = time.perf_counter()
    # 1) Entradas RAW desde Delta
    log_step("Leyendo entradas RAW desde py-portada-data-layer")
    df_entries = layer.read_raw_entries()
    if df_entries is None:
        raise RuntimeError("No se pudieron leer entradas RAW desde py-portada-data-layer")

    df_entries = clean_entries_for_similarity(layer, df_entries)
    log_step("Contando entradas limpias")
    entry_count = df_entries.count()
    log_step(f"Entradas listas para similitud: {entry_count}")
    all_results = {
        "timestamp": datetime.now().isoformat(),
        "source": "py-portada-data-layer",
        "total_entries": entry_count,
        "entities": {},
    }

    # 2) Desambiguación por entidad
    selected_entities = entities or ENTITIES
    log_step(f"Entidades a procesar: {selected_entities}")
    for entity_idx, entity_name in enumerate(selected_entities, start=1):
        entity_start = time.perf_counter()
        log_step(f"[{entity_idx}/{len(selected_entities)}] Iniciando entidad: {entity_name}")
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
            voices_dict = collect_known_voices(layer, entity_name, fallback_known_entities_path)
            entity_result["known_voices"] = len(voices_dict)
            if not voices_dict:
                entity_result["status"] = "no_known_entities"
                all_results["entities"][entity_name] = entity_result
                log_step(f"[{entity_name}] Saltada: {entity_result['status']}")
                continue

            citations_counter = collect_citations(layer, df_entries, entity_name)
            if not citations_counter:
                entity_result["status"] = "no_citations"
                all_results["entities"][entity_name] = entity_result
                log_step(f"[{entity_name}] Saltada: {entity_result['status']}")
                continue

            terms_input = [{"term": term, "frequency": freq} for term, freq in citations_counter.items()]
            log_step(f"[{entity_name}] Preparando VoiceList con {len(voices_dict)} canónicas")
            voice_list = voice_list_factory.from_dict(entity_type=entity_name, data=voices_dict)
            # 3) Matching multi-algoritmo con clasificación final
            log_step(f"[{entity_name}] Ejecutando evaluate sobre {len(terms_input)} términos")
            results_list = service.evaluate(terms_input, voice_list)
            log_step(f"[{entity_name}] evaluate completado con {len(results_list)} resultados")

            entity_result["unique_terms"] = len(terms_input)
            entity_result["total_citations"] = sum(citations_counter.values())
            entity_result["status"] = "success"
            entity_result["results"] = results_list
            log_step(f"[{entity_name}] OK raw_results={len(results_list)} ({format_seconds(entity_start)})")
        except Exception as exc:
            entity_result["status"] = "error"
            entity_result["error"] = str(exc)[:300]
            log_step(f"[{entity_name}] ERROR: {entity_result['error']} ({format_seconds(entity_start)})")

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

    script_start = time.perf_counter()
    # Parámetros CLI
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("GENERACIÓN DE SIMILITUDES CON py-portada-data-layer")
    print("=" * 80)
    log_step(f"Output configurado: {output_dir / args.output_file}")

    # Inicialización de capa + config
    layer = build_layer(args.data_layer_config, args.schema, args.mapping)
    log_step(f"Cargando config de similitud: {args.similarity_config}")
    similarity_config = read_json(args.similarity_config)
    disabled_algorithms = disable_unavailable_optional_algorithms(similarity_config)
    runtime_device_changes = normalize_runtime_devices(similarity_config)
    if disabled_algorithms:
        print(f"[WARN] Algoritmos opcionales desactivados por dependencias faltantes: {disabled_algorithms}")
    if runtime_device_changes:
        print(f"[WARN] Ajustes de dispositivo por runtime sin CUDA: {runtime_device_changes}")
    service = SimilarityService.from_dict(similarity_config)
    available_algorithms = get_available_algorithms(service)
    log_step(f"Algoritmos a calcular ({len(available_algorithms)}): {available_algorithms}")
    log_step("SimilarityService creado")
    results = run_similarity_generation(layer, service, VoiceList, args.entities, args.known_entities)
    results["disabled_algorithms"] = disabled_algorithms
    results["runtime_device_changes"] = runtime_device_changes

    # Persistencia del resultado agregado
    output_path = output_dir / args.output_file
    log_step(f"Escribiendo JSON final: {output_path}")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    log_step(f"JSON final escrito: {output_path}")

    # Cierre ordenado de sesión Spark
    if getattr(layer, "spark", None) is not None:
        log_step("Cerrando sesión Spark")
        layer.stop_session()

    print(f"Resultados guardados en: {output_path}")
    log_step(f"Proceso completo en {format_seconds(script_start)}")
    print("=" * 80)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
