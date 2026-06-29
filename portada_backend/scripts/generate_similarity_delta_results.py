"""
Generate Portada similarity results into Delta Lake instead of a monolithic JSON file.

This script keeps the current similarity-service contract, but changes the durable
output model:
- physical paths are resolved from the Spark/data-layer config
  (<base_path>/<project_data_name>/similarity_results/...)
- results are stored as Delta tables that can be queried/paginated later
- known voices are NOT duplicated into a similarity_known_voices table; they stay
  in the existing data-layer/entity source and are only read for scoring
- semantic_model is force-disabled because it is too expensive for this batch
  path and overlaps with the dedicated semantic algorithms
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate_similarity_with_datalayer import (  # type: ignore[import-not-found]
    DEFAULT_DATA_LAYER_CONFIG_PATH,
    DEFAULT_MAPPING_PATH,
    DEFAULT_SCHEMA_PATH,
    DEFAULT_SIMILARITY_CONFIG_PATH,
    ENTITIES,
    build_layer,
    clean_entries_for_similarity,
    collect_citations,
    disable_unavailable_optional_algorithms,
    format_seconds,
    get_allowed_algorithms,
    get_available_algorithms,
    log_step,
    normalize_runtime_devices,
    read_all_raw_entries,
    read_json,
)

FORCED_EXCLUDED_ALGORITHMS = {"semantic_model"}
DEFAULT_RESULTS_DIR_NAME = "similarity_results"
DEFAULT_MEMORY_LOG_INTERVAL_SECONDS = 30


def _row_to_dict(row: Any) -> dict[str, Any]:
    if hasattr(row, "asDict"):
        return row.asDict(recursive=True)
    if isinstance(row, dict):
        return row
    return dict(row)


def _strip_file_protocol(value: str) -> str:
    return value.removeprefix("file://")


def resolve_similarity_results_root(
    data_layer_config: dict[str, Any],
    results_dir_name: str = DEFAULT_RESULTS_DIR_NAME,
) -> str:
    """Resolve the physical Delta output root from Spark/data-layer config."""
    base_path = str(
        data_layer_config.get("base_path")
        or data_layer_config.get("_base_path")
        or "/app/delta_lake"
    ).strip().rstrip("/")
    project_name = str(
        data_layer_config.get("project_data_name")
        or data_layer_config.get("_project_data_name")
        or "portada_project"
    ).strip().strip("/")

    base_path = _strip_file_protocol(base_path).rstrip("/")
    return f"{base_path}/{project_name}/{results_dir_name.strip('/')}"


def table_path(output_root: str, table_name: str) -> str:
    return f"{output_root.rstrip('/')}/{table_name.strip('/')}"


def collect_delta_known_voices(layer: Any, entity_name: str) -> dict[str, list[str]]:
    """Read known voices from the data-layer Delta entity source only.

    The current Delta schema stores one canonical entity per row with:
    - name: canonical entity name
    - voices: array of known voices

    Older/intermediate schemas may expose either `voice` rows or
    `normalized_name`; those are supported for compatibility. JSON fallback is
    intentionally not used here because this script must be Delta-authoritative.
    """
    step_start = time.perf_counter()
    log_step(f"[{entity_name}] Leyendo voces conocidas desde Delta")

    df_entities = layer.read_raw_entities(entity_name)
    if df_entities is None:
        raise RuntimeError(f"No se encontró tabla Delta de voces conocidas para '{entity_name}'")

    rows = df_entities.collect()
    voices: dict[str, list[str]] = {}

    for row in rows:
        data = _row_to_dict(row)
        canonical = str(
            data.get("name")
            or data.get("normalized_name")
            or data.get("canonical")
            or ""
        ).strip()
        if not canonical:
            continue

        raw_voices = data.get("voices")
        if raw_voices is None and data.get("voice") is not None:
            raw_voices = [data.get("voice")]
        if isinstance(raw_voices, str):
            raw_voices = [raw_voices]
        if raw_voices is None:
            raw_voices = []

        cleaned_voices = [
            str(voice).strip()
            for voice in raw_voices
            if str(voice).strip() and str(voice).strip().lower() not in {"null", "none"}
        ]
        if cleaned_voices:
            voices.setdefault(canonical, [])
            for voice in cleaned_voices:
                if voice not in voices[canonical]:
                    voices[canonical].append(voice)

    if not voices:
        raise RuntimeError(
            f"La tabla Delta de voces conocidas para '{entity_name}' no contiene voces válidas"
        )

    log_step(f"[{entity_name}] Voces conocidas Delta cargadas: {len(voices)} ({format_seconds(step_start)})")
    return voices


def stable_config_hash(config: dict[str, Any]) -> str:
    raw = json.dumps(config, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def format_bytes(value: int | float | None) -> str:
    if value is None:
        return "n/a"
    size = float(value)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if abs(size) < 1024.0 or unit == "TiB":
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} TiB"


def _read_int(path: str | Path) -> int | None:
    try:
        raw = Path(path).read_text(encoding="utf-8").strip()
        if raw == "max":
            return None
        return int(raw)
    except Exception:
        return None


def _process_rss_bytes(pid: int) -> int:
    try:
        page_size = int(getattr(os, "sysconf")("SC_PAGE_SIZE"))
        statm = Path(f"/proc/{pid}/statm").read_text(encoding="utf-8").split()
        return int(statm[1]) * page_size
    except Exception:
        return 0


def _children_by_parent() -> dict[int, list[int]]:
    children: dict[int, list[int]] = {}
    proc_root = Path("/proc")
    for entry in proc_root.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            status = (entry / "status").read_text(encoding="utf-8")
        except Exception:
            continue
        ppid = None
        for line in status.splitlines():
            if line.startswith("PPid:"):
                ppid = int(line.split()[1])
                break
        if ppid is not None:
            children.setdefault(ppid, []).append(int(entry.name))
    return children


def process_tree_rss_bytes(pid: int | None = None) -> int:
    """Return RSS for this process plus child processes, including Spark JVMs."""
    root_pid = int(pid or os.getpid())
    children = _children_by_parent()
    pending = [root_pid]
    seen: set[int] = set()
    total = 0
    while pending:
        current = pending.pop()
        if current in seen:
            continue
        seen.add(current)
        total += _process_rss_bytes(current)
        pending.extend(children.get(current, []))
    return total


def container_memory_usage_bytes() -> int | None:
    """Read cgroup memory usage when running inside Docker/Linux containers."""
    candidates = [
        "/sys/fs/cgroup/memory.current",  # cgroup v2
        "/sys/fs/cgroup/memory/memory.usage_in_bytes",  # cgroup v1
    ]
    for candidate in candidates:
        value = _read_int(candidate)
        if value is not None:
            return value
    return None


def log_memory_usage(label: str = "runtime") -> None:
    tree_rss = process_tree_rss_bytes()
    container_usage = container_memory_usage_bytes()
    log_step(
        f"[memory] {label}: process_tree_rss={format_bytes(tree_rss)} "
        f"container_usage={format_bytes(container_usage)}"
    )


class MemoryMonitor:
    """Background memory logger for long Spark similarity runs."""

    def __init__(self, interval_seconds: int) -> None:
        self.interval_seconds = max(0, int(interval_seconds))
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self.interval_seconds <= 0:
            return
        self._thread = threading.Thread(target=self._run, name="memory-monitor", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)

    def _run(self) -> None:
        log_memory_usage("start")
        while not self._stop.wait(self.interval_seconds):
            log_memory_usage("periodic")


def disable_forced_excluded_algorithms(similarity_config: dict[str, Any]) -> list[str]:
    """Remove algorithms that must never run in this Delta batch script."""
    disabled: list[str] = []
    algorithms = similarity_config.get("algorithms", {})
    for algorithm_name in sorted(FORCED_EXCLUDED_ALGORITHMS):
        if algorithm_name in algorithms:
            algorithms.pop(algorithm_name, None)
            disabled.append(algorithm_name)

        for names in similarity_config.get("algorithm_per_entity", {}).values():
            while algorithm_name in names:
                names.remove(algorithm_name)

    return disabled


def build_run_record(
    *,
    run_id: str,
    output_root: str,
    source: str,
    total_entries: int,
    selected_entities: list[str],
    disabled_algorithms: list[str],
    runtime_device_changes: list[str],
    status: str,
    error_message: str,
    config_hash: str = "",
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "created_at": datetime.now().isoformat(),
        "source": source,
        "output_root": output_root,
        "total_entries": int(total_entries),
        "selected_entities_json": json.dumps(selected_entities, ensure_ascii=False),
        "disabled_algorithms": list(disabled_algorithms),
        "runtime_device_changes": list(runtime_device_changes),
        "config_hash": config_hash,
        "status": status,
        "error_message": error_message,
    }


def _spark_schema(fields: list[tuple[str, str]]):
    from pyspark.sql.types import (
        ArrayType,
        BooleanType,
        DoubleType,
        IntegerType,
        StringType,
        StructField,
        StructType,
    )

    type_by_name = {
        "array_string": ArrayType(StringType()),
        "bool": BooleanType(),
        "double": DoubleType(),
        "int": IntegerType(),
        "str": StringType(),
    }
    return StructType([StructField(name, type_by_name[kind], True) for name, kind in fields])


def _write_records_delta(
    spark: Any,
    records: list[dict[str, Any]],
    path: str,
    fields: list[tuple[str, str]],
    *,
    mode: str = "append",
    partition_by: list[str] | None = None,
) -> None:
    schema = _spark_schema(fields)
    df = spark.createDataFrame(records, schema=schema)
    writer = df.write.format("delta").mode(mode)
    if partition_by:
        writer = writer.partitionBy(*partition_by)
    writer.save(path)


def _result_records(
    *,
    run_id: str,
    entity_name: str,
    results_list: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for result in results_list:
        scores = result.get("algorithm_scores", []) or []
        scores = [_normalize_algorithm_score(score) for score in scores]
        voted_scores = [s for s in scores if bool(s.get("voted"))]
        best_score = max((float(s.get("score", 0.0)) for s in scores), default=0.0)
        best = max(scores, key=lambda s: float(s.get("score", 0.0)), default={})
        records.append({
            "run_id": run_id,
            "entity_type": entity_name,
            "term": str(result.get("term", "")),
            "normalized": str(result.get("normalized", "")),
            "frequency": int(result.get("frequency", 0) or 0),
            "exact_match": bool(result.get("exact_match", False)),
            "best_entity": str(best.get("best_entity", "") or ""),
            "best_voice": str(best.get("best_voice", "") or ""),
            "best_score": float(best_score),
            "votes_approval": int(len(voted_scores)),
            "algorithm_scores_json": json.dumps(scores, ensure_ascii=False),
        })
    return records


def _score_records(
    *,
    run_id: str,
    entity_name: str,
    results_list: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for result in results_list:
        term = str(result.get("term", ""))
        normalized = str(result.get("normalized", ""))
        frequency = int(result.get("frequency", 0) or 0)
        for raw_score in result.get("algorithm_scores", []) or []:
            score = _normalize_algorithm_score(raw_score)
            records.append({
                "run_id": run_id,
                "entity_type": entity_name,
                "term": term,
                "normalized": normalized,
                "frequency": frequency,
                "algorithm": str(score.get("algorithm", "")),
                "best_voice": str(score.get("best_voice", "") or ""),
                "best_entity": str(score.get("best_entity", "") or ""),
                "score": float(score.get("score", 0.0) or 0.0),
                "threshold": float(score.get("threshold", 0.0) or 0.0),
                "voted": bool(score.get("voted", False)),
                "in_gray_zone": bool(score.get("in_gray_zone", False)),
            })
    return records


def _normalize_algorithm_score(score: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(score)
    if normalized.get("algorithm") == "semantica":
        normalized["algorithm"] = "token_jaccard"
    return normalized


def _term_records(*, run_id: str, entity_name: str, citations_counter: Any) -> list[dict[str, Any]]:
    return [
        {
            "run_id": run_id,
            "entity_type": entity_name,
            "term": str(term),
            "frequency": int(freq),
        }
        for term, freq in citations_counter.items()
    ]


def run_similarity_delta_generation(
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
    fallback_known_entities_path: str | Path | None = None,
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

    summary_records: list[dict[str, Any]] = []
    status = "success"
    error_message = ""

    term_fields = [
        ("run_id", "str"), ("entity_type", "str"), ("term", "str"), ("frequency", "int"),
    ]
    result_fields = [
        ("run_id", "str"), ("entity_type", "str"), ("term", "str"), ("normalized", "str"),
        ("frequency", "int"), ("exact_match", "bool"), ("best_entity", "str"),
        ("best_voice", "str"), ("best_score", "double"), ("votes_approval", "int"),
        ("algorithm_scores_json", "str"),
    ]
    score_fields = [
        ("run_id", "str"), ("entity_type", "str"), ("term", "str"), ("normalized", "str"),
        ("frequency", "int"), ("algorithm", "str"), ("best_voice", "str"), ("best_entity", "str"),
        ("score", "double"), ("threshold", "double"), ("voted", "bool"), ("in_gray_zone", "bool"),
    ]

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
            if fallback_known_entities_path:
                log_step(
                    f"[{entity_name}] Ignorando fallback JSON de voces conocidas; "
                    "este script lee voces exclusivamente desde Delta"
                )
            voices_dict = collect_delta_known_voices(layer, entity_name)
            known_voices = len(voices_dict)
            if not voices_dict:
                entity_status = "no_known_entities"
                continue

            citations_counter = collect_citations(layer, df_entries, entity_name)
            if not citations_counter:
                entity_status = "no_citations"
                continue

            term_records = _term_records(
                run_id=run_id,
                entity_name=entity_name,
                citations_counter=citations_counter,
            )
            _write_records_delta(
                spark,
                term_records,
                table_path(output_root, "similarity_terms"),
                term_fields,
                partition_by=["run_id", "entity_type"],
            )

            terms_input = [{"term": term, "frequency": freq} for term, freq in citations_counter.items()]
            unique_terms = len(terms_input)
            total_citations = int(sum(citations_counter.values()))
            log_step(f"[{entity_name}] Preparando VoiceList con {known_voices} canónicas")
            voice_list = voice_list_factory.from_dict(entity_type=entity_name, data=voices_dict)

            # IMPORTANT: by requirement, this evaluates all configured algorithms except semantic_model,
            # even when an algorithm is not listed for this specific entity.
            log_step(f"[{entity_name}] Ejecutando evaluate con todos los algoritmos configurados")
            results_list = service.evaluate(terms_input, voice_list)
            result_count = len(results_list)

            _write_records_delta(
                spark,
                _result_records(run_id=run_id, entity_name=entity_name, results_list=results_list),
                table_path(output_root, "similarity_results"),
                result_fields,
                partition_by=["run_id", "entity_type"],
            )
            _write_records_delta(
                spark,
                _score_records(run_id=run_id, entity_name=entity_name, results_list=results_list),
                table_path(output_root, "similarity_algorithm_scores"),
                score_fields,
                partition_by=["run_id", "entity_type", "algorithm"],
            )
            entity_status = "success"
            log_step(f"[{entity_name}] OK results={result_count} ({format_seconds(entity_start)})")
        except Exception as exc:  # keep processing the remaining entities
            entity_status = "error"
            entity_error = str(exc)[:500]
            status = "partial_error"
            error_message = entity_error if not error_message else error_message
            log_step(f"[{entity_name}] ERROR: {entity_error} ({format_seconds(entity_start)})")
        finally:
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

    summary_fields = [
        ("run_id", "str"), ("entity_type", "str"), ("status", "str"),
        ("known_voices", "int"), ("unique_terms", "int"), ("total_citations", "int"),
        ("result_count", "int"), ("available_algorithms", "array_string"),
        ("allowed_algorithms", "array_string"), ("error_message", "str"),
    ]
    _write_records_delta(
        spark,
        summary_records,
        table_path(output_root, "similarity_entity_summaries"),
        summary_fields,
        partition_by=["run_id"],
    )

    run_record = build_run_record(
        run_id=run_id,
        output_root=output_root,
        source="py-portada-data-layer",
        total_entries=total_entries,
        selected_entities=selected_entities,
        disabled_algorithms=disabled_algorithms,
        runtime_device_changes=runtime_device_changes,
        status=status,
        error_message=error_message,
        config_hash=config_hash,
    )
    run_fields = [
        ("run_id", "str"), ("created_at", "str"), ("source", "str"), ("output_root", "str"),
        ("total_entries", "int"), ("selected_entities_json", "str"),
        ("disabled_algorithms", "array_string"), ("runtime_device_changes", "array_string"),
        ("config_hash", "str"), ("status", "str"), ("error_message", "str"),
    ]
    _write_records_delta(
        spark,
        [run_record],
        table_path(output_root, "similarity_runs"),
        run_fields,
    )

    log_step(f"Proceso Delta completo run_id={run_id} en {format_seconds(run_start)}")
    return {
        "run_id": run_id,
        "output_root": output_root,
        "status": status,
        "total_entries": total_entries,
        "entities": summary_records,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genera similitudes y las guarda en Delta Lake")
    parser.add_argument("--data-layer-config", default=DEFAULT_DATA_LAYER_CONFIG_PATH)
    parser.add_argument("--similarity-config", default=DEFAULT_SIMILARITY_CONFIG_PATH)
    parser.add_argument("--schema", default=DEFAULT_SCHEMA_PATH)
    parser.add_argument("--mapping", default=DEFAULT_MAPPING_PATH)
    parser.add_argument(
        "--known-entities",
        default=None,
        help="Deprecated/ignored. Known voices are read exclusively from Delta.",
    )
    parser.add_argument("--entities", nargs="*", default=ENTITIES)
    parser.add_argument("--results-dir-name", default=DEFAULT_RESULTS_DIR_NAME)
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
    memory_monitor = MemoryMonitor(args.memory_log_interval_seconds)
    memory_monitor.start()
    print("=" * 80)
    print("GENERACIÓN DE SIMILITUDES HACIA DELTA LAKE")
    print("=" * 80)
    layer = None
    try:
        data_layer_config = read_json(args.data_layer_config)
        output_root = resolve_similarity_results_root(data_layer_config, args.results_dir_name)
        layer = build_layer(args.data_layer_config, args.schema, args.mapping)

        log_step(f"Cargando config de similitud: {args.similarity_config}")
        similarity_config = read_json(args.similarity_config)
        forced_disabled = disable_forced_excluded_algorithms(similarity_config)
        optional_disabled = disable_unavailable_optional_algorithms(similarity_config)
        runtime_device_changes = normalize_runtime_devices(similarity_config)
        disabled_algorithms = list(dict.fromkeys([*forced_disabled, *optional_disabled]))
        config_hash = stable_config_hash(similarity_config)

        if forced_disabled:
            print(f"[WARN] Algoritmos desactivados por política del script Delta: {forced_disabled}")
        if optional_disabled:
            print(f"[WARN] Algoritmos opcionales desactivados por dependencias faltantes: {optional_disabled}")
        if runtime_device_changes:
            print(f"[WARN] Ajustes de dispositivo por runtime sin CUDA: {runtime_device_changes}")

        service = SimilarityService.from_dict(similarity_config)
        log_step(f"Algoritmos a calcular ({len(get_available_algorithms(service))}): {get_available_algorithms(service)}")

        result = run_similarity_delta_generation(
            layer=layer,
            service=service,
            voice_list_factory=VoiceList,
            spark=layer.spark,
            output_root=output_root,
            config_hash=config_hash,
            disabled_algorithms=disabled_algorithms,
            runtime_device_changes=runtime_device_changes,
            entities=args.entities,
            fallback_known_entities_path=args.known_entities,
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
