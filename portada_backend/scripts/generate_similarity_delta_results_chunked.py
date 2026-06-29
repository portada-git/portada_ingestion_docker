"""
Generate Portada similarity results into Delta Lake using bounded Python batches.

This script preserves the same Delta output contract as
`generate_similarity_delta_results.py`, but avoids holding all terms/results for
an entity in Python memory at once. Spark still computes term frequencies; Python
only evaluates a configurable batch of unique terms at a time.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pyspark.sql import functions as F  # type: ignore[import-not-found]
from pyspark import StorageLevel  # type: ignore[import-not-found]

from generate_similarity_delta_results import (  # type: ignore[import-not-found]
    DEFAULT_MEMORY_LOG_INTERVAL_SECONDS,
    DEFAULT_RESULTS_DIR_NAME,
    _result_records,
    _score_records,
    _spark_schema,
    build_run_record,
    collect_delta_known_voices,
    disable_forced_excluded_algorithms,
    log_memory_usage,
    MemoryMonitor,
    resolve_similarity_results_root,
    stable_config_hash,
    table_path,
)
from generate_similarity_with_datalayer import (  # type: ignore[import-not-found]
    DEFAULT_DATA_LAYER_CONFIG_PATH,
    DEFAULT_MAPPING_PATH,
    DEFAULT_SCHEMA_PATH,
    DEFAULT_SIMILARITY_CONFIG_PATH,
    ENTITIES,
    build_layer,
    clean_entries_for_similarity,
    disable_unavailable_optional_algorithms,
    format_seconds,
    get_allowed_algorithms,
    get_available_algorithms,
    log_step,
    normalize_runtime_devices,
    read_all_raw_entries,
    read_json,
)

DEFAULT_BATCH_SIZE = 10_000

TERM_FIELDS = [
    ("run_id", "str"), ("entity_type", "str"), ("term", "str"), ("frequency", "int"),
]
RESULT_FIELDS = [
    ("run_id", "str"), ("entity_type", "str"), ("term", "str"), ("normalized", "str"),
    ("frequency", "int"), ("exact_match", "bool"), ("best_entity", "str"),
    ("best_voice", "str"), ("best_score", "double"), ("votes_approval", "int"),
    ("algorithm_scores_json", "str"),
]
SCORE_FIELDS = [
    ("run_id", "str"), ("entity_type", "str"), ("term", "str"), ("normalized", "str"),
    ("frequency", "int"), ("algorithm", "str"), ("best_voice", "str"), ("best_entity", "str"),
    ("score", "double"), ("threshold", "double"), ("voted", "bool"), ("in_gray_zone", "bool"),
]
SUMMARY_FIELDS = [
    ("run_id", "str"), ("entity_type", "str"), ("status", "str"),
    ("known_voices", "int"), ("unique_terms", "int"), ("total_citations", "int"),
    ("result_count", "int"), ("available_algorithms", "array_string"),
    ("allowed_algorithms", "array_string"), ("error_message", "str"),
]
RUN_FIELDS = [
    ("run_id", "str"), ("created_at", "str"), ("source", "str"), ("output_root", "str"),
    ("total_entries", "int"), ("selected_entities_json", "str"),
    ("disabled_algorithms", "array_string"), ("runtime_device_changes", "array_string"),
    ("config_hash", "str"), ("status", "str"), ("error_message", "str"),
]


def _write_records_delta(
    spark: Any,
    records: list[dict[str, Any]],
    path: str,
    fields: list[tuple[str, str]],
    *,
    mode: str = "append",
    partition_by: list[str] | None = None,
) -> None:
    if not records:
        return
    df = spark.createDataFrame(records, schema=_spark_schema(fields))
    writer = df.write.format("delta").mode(mode)
    if partition_by:
        writer = writer.partitionBy(*partition_by)
    writer.save(path)


def _extract_citations_df(layer: Any, df_entries: Any, entity_name: str) -> Any:
    if entity_name == "port":
        return layer.extract_ports(df_entries, from_port_of_calls=False, from_arrival_port=False)
    if entity_name == "ship_type":
        return layer.extract_ship_types(df_entries)
    if entity_name == "flag":
        return layer.extract_ship_flags(df_entries)
    if entity_name == "ship_tons":
        return layer.extract_ship_tons_units(df_entries)
    if entity_name == "master_role":
        return layer.extract_master_roles(df_entries)
    if entity_name == "comodity":
        return layer.extract_cargo_comodities_and_units(df_entries).filter(
            "cargo_commodity_citation IS NOT NULL"
        ).selectExpr("cargo_commodity_citation as citation")
    if entity_name == "unit":
        return layer.extract_cargo_comodities_and_units(df_entries).filter(
            "cargo_unit_citation IS NOT NULL"
        ).selectExpr("cargo_unit_citation as citation")
    if entity_name == "travel_duration" and hasattr(layer, "extract_travel_durations"):
        return layer.extract_travel_durations(df_entries)
    if entity_name == "travel_duration":
        candidate_fields = [
            "travel_duration_unit",
            "travel_duration_value",
            "travel_duration_unit_detailed_value",
            "travel_duration_value_detailed_value",
        ]
        available = set(getattr(df_entries, "columns", []))
        for field in candidate_fields:
            if field in available:
                return df_entries.selectExpr(f"{field} as citation")
        return None
    raise ValueError(f"Entidad no soportada: {entity_name}")


def build_term_frequency_df(layer: Any, df_entries: Any, entity_name: str) -> Any:
    step_start = time.perf_counter()
    log_step(f"[{entity_name}] Extrayendo y agregando citaciones con Spark")
    df_citations = _extract_citations_df(layer, df_entries, entity_name)
    if df_citations is None:
        return None

    df_frequency = (
        df_citations
        .select(F.trim(F.col("citation").cast("string")).alias("term"))
        .filter(F.col("term").isNotNull())
        .filter(F.col("term") != "")
        .groupBy("term")
        .agg(F.count(F.lit(1)).cast("int").alias("frequency"))
    )
    df_frequency = df_frequency.persist(StorageLevel.DISK_ONLY)
    log_step(f"[{entity_name}] Citaciones agregadas en Spark y persistidas en disco ({format_seconds(step_start)})")
    return df_frequency


def write_terms_from_frequency_df(
    *,
    df_frequency: Any,
    run_id: str,
    entity_name: str,
    output_root: str,
) -> None:
    (
        df_frequency
        .select(
            F.lit(run_id).alias("run_id"),
            F.lit(entity_name).alias("entity_type"),
            F.col("term"),
            F.col("frequency"),
        )
        .write
        .format("delta")
        .mode("append")
        .partitionBy("run_id", "entity_type")
        .save(table_path(output_root, "similarity_terms"))
    )


def iter_term_batches(df_frequency: Any, batch_size: int) -> Iterator[list[dict[str, Any]]]:
    batch: list[dict[str, Any]] = []
    for row in df_frequency.select("term", "frequency").toLocalIterator():
        batch.append({"term": str(row["term"]), "frequency": int(row["frequency"] or 0)})
        if len(batch) >= batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


def frequency_stats(df_frequency: Any) -> tuple[int, int]:
    row = df_frequency.agg(
        F.count(F.lit(1)).cast("int").alias("unique_terms"),
        F.coalesce(F.sum("frequency"), F.lit(0)).cast("int").alias("total_citations"),
    ).collect()[0]
    return int(row["unique_terms"] or 0), int(row["total_citations"] or 0)


def disable_requested_algorithms(similarity_config: dict[str, Any], algorithm_names: list[str] | None) -> list[str]:
    disabled: list[str] = []
    if not algorithm_names:
        return disabled
    algorithms = similarity_config.get("algorithms", {})
    for algorithm_name in algorithm_names:
        if algorithm_name in algorithms:
            algorithms.pop(algorithm_name, None)
            disabled.append(algorithm_name)
        for names in similarity_config.get("algorithm_per_entity", {}).values():
            while algorithm_name in names:
                names.remove(algorithm_name)
    return disabled


def run_similarity_delta_generation_chunked(
    *,
    layer: Any,
    service: Any,
    voice_list_factory: Any,
    spark: Any,
    output_root: str,
    config_hash: str,
    disabled_algorithms: list[str],
    runtime_device_changes: list[str],
    entities: list[str] | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    max_batches_per_entity: int | None = None,
) -> dict[str, Any]:
    run_id = datetime.now().strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:8]
    selected_entities = entities or ENTITIES
    run_start = time.perf_counter()

    log_step("Leyendo entradas RAW desde py-portada-data-layer")
    df_entries = read_all_raw_entries(layer)
    if df_entries is None:
        raise RuntimeError("No se pudieron leer entradas RAW desde py-portada-data-layer")

    df_entries = clean_entries_for_similarity(layer, df_entries)
    total_entries = int(df_entries.count())
    log_step(f"Entradas listas para similitud: {total_entries}")
    log_step(f"Output Delta root: {output_root}")
    log_step(f"Batch size de términos únicos: {batch_size}")

    summary_records: list[dict[str, Any]] = []
    status = "success"
    error_message = ""

    for entity_idx, entity_name in enumerate(selected_entities, start=1):
        entity_start = time.perf_counter()
        entity_status = "pending"
        known_voices = 0
        unique_terms = 0
        total_citations = 0
        result_count = 0
        entity_error = ""
        log_step(f"[{entity_idx}/{len(selected_entities)}] Iniciando entidad: {entity_name}")

        try:
            voices_dict = collect_delta_known_voices(layer, entity_name)
            known_voices = len(voices_dict)
            if not voices_dict:
                entity_status = "no_known_entities"
                continue

            df_frequency = build_term_frequency_df(layer, df_entries, entity_name)
            if df_frequency is None:
                entity_status = "no_citations"
                continue

            unique_terms, total_citations = frequency_stats(df_frequency)
            if unique_terms == 0:
                entity_status = "no_citations"
                continue

            write_terms_from_frequency_df(
                df_frequency=df_frequency,
                run_id=run_id,
                entity_name=entity_name,
                output_root=output_root,
            )

            log_step(f"[{entity_name}] Preparando VoiceList con {known_voices} canónicas")
            voice_list = voice_list_factory.from_dict(entity_type=entity_name, data=voices_dict)

            for batch_idx, terms_batch in enumerate(iter_term_batches(df_frequency, batch_size), start=1):
                if max_batches_per_entity is not None and batch_idx > max_batches_per_entity:
                    log_step(f"[{entity_name}] Deteniendo prueba tras {max_batches_per_entity} batch(es)")
                    break
                batch_start = time.perf_counter()
                log_step(
                    f"[{entity_name}] Batch {batch_idx}: evaluando {len(terms_batch)} términos "
                    f"({result_count}/{unique_terms} previos)"
                )
                batch_results = service.evaluate(terms_batch, voice_list)
                result_count += len(batch_results)

                _write_records_delta(
                    spark,
                    _result_records(run_id=run_id, entity_name=entity_name, results_list=batch_results),
                    table_path(output_root, "similarity_results"),
                    RESULT_FIELDS,
                    partition_by=["run_id", "entity_type"],
                )
                _write_records_delta(
                    spark,
                    _score_records(run_id=run_id, entity_name=entity_name, results_list=batch_results),
                    table_path(output_root, "similarity_algorithm_scores"),
                    SCORE_FIELDS,
                    partition_by=["run_id", "entity_type", "algorithm"],
                )
                log_step(f"[{entity_name}] Batch {batch_idx} escrito ({format_seconds(batch_start)})")
                log_memory_usage(f"{entity_name} batch {batch_idx}")
                del batch_results

            entity_status = "success"
            log_step(f"[{entity_name}] OK results={result_count} ({format_seconds(entity_start)})")
        except Exception as exc:
            entity_status = "error"
            entity_error = str(exc)[:500]
            status = "partial_error"
            error_message = entity_error if not error_message else error_message
            log_step(f"[{entity_name}] ERROR: {entity_error} ({format_seconds(entity_start)})")
        finally:
            try:
                if "df_frequency" in locals() and df_frequency is not None:
                    df_frequency.unpersist(blocking=False)
            except Exception:
                pass
            summary_records.append({
                "run_id": run_id,
                "entity_type": entity_name,
                "status": entity_status,
                "known_voices": int(known_voices),
                "unique_terms": int(unique_terms),
                "total_citations": int(total_citations),
                "result_count": int(result_count),
                "available_algorithms": get_available_algorithms(service),
                "allowed_algorithms": get_allowed_algorithms(service, entity_name),
                "error_message": entity_error,
            })

    _write_records_delta(
        spark,
        summary_records,
        table_path(output_root, "similarity_entity_summaries"),
        SUMMARY_FIELDS,
        partition_by=["run_id"],
    )

    run_record = build_run_record(
        run_id=run_id,
        output_root=output_root,
        source="py-portada-data-layer-chunked",
        total_entries=total_entries,
        selected_entities=selected_entities,
        disabled_algorithms=disabled_algorithms,
        runtime_device_changes=runtime_device_changes,
        status=status,
        error_message=error_message,
        config_hash=config_hash,
    )
    _write_records_delta(spark, [run_record], table_path(output_root, "similarity_runs"), RUN_FIELDS)

    log_step(f"Proceso Delta chunked completo run_id={run_id} en {format_seconds(run_start)}")
    return {
        "run_id": run_id,
        "output_root": output_root,
        "status": status,
        "total_entries": total_entries,
        "entities": summary_records,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genera similitudes hacia Delta Lake por lotes")
    parser.add_argument("--data-layer-config", default=DEFAULT_DATA_LAYER_CONFIG_PATH)
    parser.add_argument("--similarity-config", default=DEFAULT_SIMILARITY_CONFIG_PATH)
    parser.add_argument("--schema", default=DEFAULT_SCHEMA_PATH)
    parser.add_argument("--mapping", default=DEFAULT_MAPPING_PATH)
    parser.add_argument("--entities", nargs="*", default=ENTITIES)
    parser.add_argument("--results-dir-name", default=DEFAULT_RESULTS_DIR_NAME)
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--max-batches-per-entity", type=int, default=None, help="Solo para pruebas: detiene cada entidad después de N batches.")
    parser.add_argument("--exclude-algorithms", nargs="*", default=[], help="Algoritmos a excluir en esta ejecución, útil para pruebas controladas.")
    parser.add_argument(
        "--memory-log-interval-seconds",
        type=int,
        default=DEFAULT_MEMORY_LOG_INTERVAL_SECONDS,
        help="Intervalo de log de RAM durante la ejecución. Usa 0 para desactivarlo.",
    )
    return parser.parse_args()


def main() -> int:
    from portada_s_index import SimilarityService, VoiceList

    args = parse_args()
    if args.batch_size <= 0:
        raise ValueError("--batch-size debe ser mayor que cero")

    memory_monitor = MemoryMonitor(args.memory_log_interval_seconds)
    memory_monitor.start()
    print("=" * 80)
    print("GENERACIÓN CHUNKED DE SIMILITUDES HACIA DELTA LAKE")
    print("=" * 80)
    layer = None
    try:
        data_layer_config = read_json(args.data_layer_config)
        output_root = resolve_similarity_results_root(data_layer_config, args.results_dir_name)
        layer = build_layer(args.data_layer_config, args.schema, args.mapping)
        layer.spark.conf.set("spark.sql.codegen.wholeStage", "false")
        layer.spark.conf.set("spark.sql.adaptive.enabled", "true")
        log_step("Spark whole-stage codegen desactivado para evitar planes Janino gigantes")

        log_step(f"Cargando config de similitud: {args.similarity_config}")
        similarity_config = read_json(args.similarity_config)
        forced_disabled = disable_forced_excluded_algorithms(similarity_config)
        requested_disabled = disable_requested_algorithms(similarity_config, args.exclude_algorithms)
        optional_disabled = disable_unavailable_optional_algorithms(similarity_config)
        runtime_device_changes = normalize_runtime_devices(similarity_config)
        disabled_algorithms = list(dict.fromkeys([*forced_disabled, *requested_disabled, *optional_disabled]))
        config_hash = stable_config_hash(similarity_config)

        if forced_disabled:
            print(f"[WARN] Algoritmos desactivados por política del script Delta: {forced_disabled}")
        if requested_disabled:
            print(f"[WARN] Algoritmos desactivados por parámetro de ejecución: {requested_disabled}")
        if optional_disabled:
            print(f"[WARN] Algoritmos opcionales desactivados por dependencias faltantes: {optional_disabled}")
        if runtime_device_changes:
            print(f"[WARN] Ajustes de dispositivo por runtime sin CUDA: {runtime_device_changes}")

        service = SimilarityService.from_dict(similarity_config)
        log_step(f"Algoritmos a calcular ({len(get_available_algorithms(service))}): {get_available_algorithms(service)}")

        result = run_similarity_delta_generation_chunked(
            layer=layer,
            service=service,
            voice_list_factory=VoiceList,
            spark=layer.spark,
            output_root=output_root,
            config_hash=config_hash,
            disabled_algorithms=disabled_algorithms,
            runtime_device_changes=runtime_device_changes,
            entities=args.entities,
            batch_size=args.batch_size,
            max_batches_per_entity=args.max_batches_per_entity,
        )

        print(f"Run ID: {result['run_id']}")
        print(f"Resultados Delta guardados en: {result['output_root']}")
        print("=" * 80)
        return 0
    finally:
        log_memory_usage("finish")
        memory_monitor.stop()
        if layer is not None and getattr(layer, "spark", None) is not None:
            log_step("Cerrando sesión Spark")
            layer.stop_session()


if __name__ == "__main__":
    raise SystemExit(main())
