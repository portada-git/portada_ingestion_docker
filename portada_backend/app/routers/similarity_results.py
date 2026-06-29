"""
Router simplificado para resultados de similitud
Frontend solo lee datos, sin procesamiento
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pathlib import Path
import base64
import csv
import json
from json import JSONDecodeError
import io
import math
import os
import pandas as pd
from typing import Iterable, List, Dict, Optional
from pydantic import BaseModel

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window

from app.services.datalayer import DataLayerService

router = APIRouter(prefix="/api/v1/similarity", tags=["similarity"])

# The datalayer generator is the canonical source for similarity results.
# Container path: /app/similarity_results
# Local development path: portada_backend/similarity_results
if Path("/app/similarity_results").exists():
    RESULTS_DIR = Path("/app/similarity_results")
else:
    RESULTS_DIR = Path(__file__).parent.parent.parent / "similarity_results"

CANONICAL_RESULTS_FILE = "similarity_results_datalayer.json"
LEGACY_RESULTS_FILE = "similarity_results.json"
DEFAULT_DATA_LAYER_CONFIG_PATH = "/app/config/delta_data_layer_config.json"
DEFAULT_SIMILARITY_RESULTS_DIR = "similarity_results"
_SIMILARITY_SPARK = None


class InvalidResultsFileError(Exception):
    def __init__(self, file_name: str, message: str) -> None:
        self.file_name = file_name
        self.message = message
        super().__init__(message)


def get_results_file() -> Path:
    """Return the canonical datalayer output, falling back to the legacy file."""
    canonical_file = RESULTS_DIR / CANONICAL_RESULTS_FILE
    if canonical_file.exists():
        return canonical_file

    return RESULTS_DIR / LEGACY_RESULTS_FILE


def load_results_data() -> Dict:
    results_file = get_results_file()

    if not results_file.exists():
        raise FileNotFoundError(results_file)

    try:
        with open(results_file, encoding="utf-8") as f:
            return json.load(f)
    except JSONDecodeError as exc:
        raise InvalidResultsFileError(
            results_file.name,
            f"Archivo de resultados inválido: {exc.msg} "
            f"(línea {exc.lineno}, columna {exc.colno}).",
        ) from exc


def _strip_file_protocol(value: str) -> str:
    return value.removeprefix("file://")


def resolve_delta_similarity_root(
    data_layer_config: Dict,
    results_dir_name: str = DEFAULT_SIMILARITY_RESULTS_DIR,
) -> str:
    """Resolve Delta similarity root from the same Spark/data-layer config used by ingestion."""
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


def get_data_layer_config() -> Dict:
    service = getattr(DataLayerService, "_instance", None)
    if service is not None and service.config:
        return service.config

    config_path = os.getenv("CONFIG_PATH", DEFAULT_DATA_LAYER_CONFIG_PATH)
    if Path(config_path).exists():
        with open(config_path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def get_delta_similarity_root() -> str:
    return resolve_delta_similarity_root(get_data_layer_config())


def delta_table_path(table_name: str) -> str:
    return f"{get_delta_similarity_root().rstrip('/')}/{table_name.strip('/')}"


def delta_table_exists(table_name: str) -> bool:
    path = Path(_strip_file_protocol(delta_table_path(table_name)))
    return path.exists() and (path / "_delta_log").exists()


def has_delta_similarity_results() -> bool:
    return delta_table_exists("similarity_runs") and delta_table_exists("similarity_results")


def get_spark():
    """Get a Spark session for read-only similarity Delta queries.

    Do not instantiate DataLayerService here: that layer starts ingestion/session
    machinery and may require Redis/sequencer params. Querying persisted Delta
    result tables should only need Spark + the data-layer config.
    """
    global _SIMILARITY_SPARK
    if _SIMILARITY_SPARK is not None:
        return _SIMILARITY_SPARK

    config = get_data_layer_config()
    builder = SparkSession.builder.appName("PortadaSimilarityResultsAPI")
    builder = builder.master(str(config.get("master", "local[*]")))

    for key, value in config.items():
        if key in {"protocol", "base_path", "project_data_name", "configs"}:
            continue
        if key.startswith("spark."):
            builder = builder.config(key, str(value))

    for item in config.get("configs", []) or []:
        if isinstance(item, dict):
            for key, value in item.items():
                if key.startswith("spark."):
                    builder = builder.config(key, str(value))

    _SIMILARITY_SPARK = builder.getOrCreate()
    return _SIMILARITY_SPARK


def read_delta_table(table_name: str):
    if not delta_table_exists(table_name):
        raise FileNotFoundError(delta_table_path(table_name))
    return get_spark().read.format("delta").load(delta_table_path(table_name))


def encode_cursor(*, frequency: int, term: str) -> str:
    payload = json.dumps({"frequency": int(frequency), "term": term}, ensure_ascii=False)
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")


def decode_cursor(cursor: str) -> Dict:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        payload = json.loads(raw)
        return {"frequency": int(payload["frequency"]), "term": str(payload["term"])}
    except Exception as exc:
        raise ValueError("Cursor de paginación inválido") from exc


def apply_cursor_filter(df, cursor: Optional[str]):
    if not cursor:
        return df
    decoded = decode_cursor(cursor)
    frequency = decoded["frequency"]
    term = decoded["term"]
    return df.where(
        (F.col("frequency") < frequency)
        | ((F.col("frequency") == frequency) & (F.col("term") > term))
    )


def build_next_cursor(rows: List[Dict], limit: int) -> Optional[str]:
    if len(rows) < limit or not rows:
        return None
    last = rows[-1]
    return encode_cursor(frequency=int(last.get("frequency", 0)), term=str(last.get("term", "")))


def apply_page_window(df, page: int, page_size: int):
    window = Window.orderBy(F.desc("frequency"), F.asc("term"))
    start_row = ((page - 1) * page_size) + 1
    end_row = page * page_size
    return (
        df.withColumn("_row_number", F.row_number().over(window))
        .where((F.col("_row_number") >= start_row) & (F.col("_row_number") <= end_row))
        .drop("_row_number")
    )


def row_to_dict(row) -> Dict:
    if hasattr(row, "asDict"):
        return row.asDict(True)
    return dict(row)


def get_latest_delta_run_id() -> Optional[str]:
    if not delta_table_exists("similarity_runs"):
        return None
    rows = (
        read_delta_table("similarity_runs")
        .orderBy(F.desc("created_at"))
        .limit(1)
        .collect()
    )
    return str(rows[0]["run_id"]) if rows else None


def get_latest_delta_run_id_for_entity(entity: str) -> Optional[str]:
    """Return the latest successful run that produced results for one entity."""
    if not delta_table_exists("similarity_entity_summaries"):
        return get_latest_delta_run_id()

    rows = (
        read_delta_table("similarity_entity_summaries")
        .alias("summary")
        .join(read_delta_table("similarity_runs").alias("run"), "run_id")
        .where(F.col("summary.entity_type") == entity)
        .where(F.col("summary.status") == "success")
        .orderBy(F.desc("run.created_at"))
        .select("run_id")
        .limit(1)
        .collect()
    )
    return str(rows[0]["run_id"]) if rows else None


def latest_successful_entity_runs_df():
    """DataFrame with the latest successful run_id for each entity."""
    summaries = read_delta_table("similarity_entity_summaries").alias("summary")
    runs = read_delta_table("similarity_runs").select("run_id", "created_at").alias("run")
    window = Window.partitionBy("summary.entity_type").orderBy(F.desc("run.created_at"))
    return (
        summaries
        .join(runs, "run_id")
        .where(F.col("summary.status") == "success")
        .withColumn("_entity_run_rank", F.row_number().over(window))
        .where(F.col("_entity_run_rank") == 1)
        .select(
            F.col("summary.entity_type").alias("entity_type"),
            F.col("run_id").alias("run_id"),
        )
    )


def query_delta_results(
    *,
    run_id: Optional[str],
    entity: Optional[str],
    limit: int,
    cursor: Optional[str],
    page: Optional[int],
    q: Optional[str],
) -> Dict:
    resolved_run_id = run_id or (get_latest_delta_run_id_for_entity(entity) if entity else get_latest_delta_run_id())
    if not resolved_run_id and (run_id or entity):
        raise FileNotFoundError(delta_table_path("similarity_runs"))

    safe_limit = max(1, min(int(limit), 500))
    df = read_delta_table("similarity_results")
    if run_id or entity:
        df = df.where(F.col("run_id") == resolved_run_id)
    elif not delta_table_exists("similarity_entity_summaries"):
        resolved_run_id = get_latest_delta_run_id()
        if not resolved_run_id:
            raise FileNotFoundError(delta_table_path("similarity_runs"))
        df = df.where(F.col("run_id") == resolved_run_id)
    else:
        latest_entities = latest_successful_entity_runs_df()
        df = df.join(latest_entities, ["run_id", "entity_type"], "inner")
    if entity:
        df = df.where(F.col("entity_type") == entity)
    if q:
        df = df.where(F.lower(F.col("term")).contains(q.lower()))

    total_count = df.count()
    total_pages = max(1, math.ceil(total_count / safe_limit)) if total_count else 0
    safe_page = max(1, min(int(page or 1), total_pages or 1))

    if page is not None:
        page_df = apply_page_window(df, safe_page, safe_limit)
    else:
        page_df = apply_cursor_filter(df, cursor)

    rows = (
        page_df.orderBy(F.desc("frequency"), F.asc("term"))
        .limit(safe_limit)
        .collect()
    )
    data = [row_to_dict(row) for row in rows]
    return {
        "source": "delta",
        "run_id": resolved_run_id,
        "entity": entity,
        "limit": safe_limit,
        "page": safe_page,
        "page_size": safe_limit,
        "total_count": total_count,
        "total_pages": total_pages,
        "has_next": safe_page < total_pages if page is not None else bool(build_next_cursor(data, safe_limit)),
        "next_cursor": build_next_cursor(data, safe_limit),
        "results": data,
    }


def parse_algorithm_scores(value) -> List[Dict]:
    if isinstance(value, list):
        return value
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def required_consensus_votes(scores_count: int) -> int:
    return math.floor(scores_count / 2) + 1


def best_scored_voice(scores: List[Dict]) -> Optional[Dict]:
    scored = [score for score in scores if isinstance(score.get("score"), (int, float))]
    return sorted(scored, key=lambda score: score.get("score", 0), reverse=True)[0] if scored else None


def compute_export_result(row: Dict, selected_algorithms: List[str]) -> Dict:
    scores = parse_algorithm_scores(row.get("algorithm_scores_json") or row.get("algorithm_scores"))
    selected_scores = [
        score for score in scores
        if not selected_algorithms or score.get("algorithm") in selected_algorithms
    ]
    voted_scores = [score for score in selected_scores if score.get("voted")]
    gray_zone_scores = [score for score in selected_scores if score.get("in_gray_zone")]
    votes_needed = required_consensus_votes(len(selected_scores))

    classification = "REJECTED"
    computed_entity = "-"
    computed_voice = "-"
    computed_votes = 0
    computed_score = None

    if row.get("exact_match"):
        best_score = best_scored_voice(selected_scores)
        classification = "EXACT"
        computed_entity = row.get("best_entity") or (best_score or {}).get("best_entity") or "-"
        computed_voice = row.get("best_voice") or (best_score or {}).get("best_voice") or "-"
        computed_votes = len(voted_scores)
        computed_score = (best_score or {}).get("score")
    else:
        votes_by_entity: Dict[str, List[Dict]] = {}
        for score in voted_scores:
            entity = score.get("best_entity")
            if entity:
                votes_by_entity.setdefault(entity, []).append(score)

        winning_entity = None
        if votes_by_entity:
            winning_entity = sorted(
                votes_by_entity,
                key=lambda entity: len(votes_by_entity[entity]),
                reverse=True,
            )[0]

        if winning_entity and len(votes_by_entity[winning_entity]) >= votes_needed:
            winning_scores = votes_by_entity[winning_entity]
            best_vote = best_scored_voice(winning_scores) or {}
            classification = "CONSENSUS"
            computed_entity = winning_entity
            computed_voice = best_vote.get("best_voice") or "-"
            computed_votes = len(winning_scores)
            computed_score = best_vote.get("score")
        elif gray_zone_scores:
            best_gray_zone = best_scored_voice(gray_zone_scores) or {}
            classification = "GRAY_ZONE"
            computed_entity = best_gray_zone.get("best_entity") or "-"
            computed_voice = best_gray_zone.get("best_voice") or "-"
            computed_votes = len(votes_by_entity.get(best_gray_zone.get("best_entity"), []))
            computed_score = best_gray_zone.get("score")
        elif winning_entity:
            computed_votes = len(votes_by_entity[winning_entity])

    export_row = {
        "term": row.get("term", ""),
        "frequency": row.get("frequency", 0),
        "classification": classification,
        "computed_entity": computed_entity,
        "computed_voice": computed_voice,
        "computed_score": computed_score if computed_score is not None else "",
        "consensus_votes": f"{computed_votes}/{len(selected_scores)}",
        "consensus_votes_required": votes_needed,
        "total_algorithm_votes": len(voted_scores),
    }

    for algorithm in selected_algorithms:
        score = next((item for item in selected_scores if item.get("algorithm") == algorithm), {})
        export_row[f"{algorithm}_voted"] = "yes" if score.get("voted") else "no"
        export_row[f"{algorithm}_score"] = score.get("score", "")
        export_row[f"{algorithm}_threshold"] = score.get("threshold", "")
        export_row[f"{algorithm}_gray_zone"] = "yes" if score.get("in_gray_zone") else "no"
        export_row[f"{algorithm}_best_entity"] = score.get("best_entity", "")
        export_row[f"{algorithm}_best_voice"] = score.get("best_voice", "")

    return export_row


def csv_stream(rows: Iterable[Dict], selected_algorithms: List[str], classification: Optional[str]):
    base_fields = [
        "term",
        "frequency",
        "classification",
        "computed_entity",
        "computed_voice",
        "computed_score",
        "consensus_votes",
        "total_algorithm_votes",
    ]
    algorithm_fields = [
        field
        for algorithm in selected_algorithms
        for field in (
            f"{algorithm}_voted",
            f"{algorithm}_score",
            f"{algorithm}_threshold",
            f"{algorithm}_gray_zone",
            f"{algorithm}_best_entity",
            f"{algorithm}_best_voice",
        )
    ]
    fields = base_fields + algorithm_fields
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    yield buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)

    for row in rows:
        export_row = compute_export_result(row_to_dict(row), selected_algorithms)
        if classification and export_row["classification"] != classification:
            continue
        writer.writerow(export_row)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)


def query_delta_export_rows(*, run_id: Optional[str], entity: str, q: Optional[str]):
    resolved_run_id = run_id or get_latest_delta_run_id_for_entity(entity)
    if not resolved_run_id:
        raise FileNotFoundError(delta_table_path("similarity_runs"))

    df = (
        read_delta_table("similarity_results")
        .where(F.col("run_id") == resolved_run_id)
        .where(F.col("entity_type") == entity)
    )
    if q:
        df = df.where(F.lower(F.col("term")).contains(q.lower()))

    return df.orderBy(F.desc("frequency"), F.asc("term")).toLocalIterator()

# ═══════════════════════════════════════════════════════════════════════════
# MODELOS
# ═══════════════════════════════════════════════════════════════════════════

class AlgorithmInfo(BaseModel):
    name: str
    enabled: bool

class EntityInfo(BaseModel):
    name: str
    display_name: str
    has_results: bool

class ResultRow(BaseModel):
    term: str
    frequency: int
    classification: str
    canonical_entity: Optional[str] = None
    similarity_score: Optional[float] = None
    algorithm_votes: Optional[Dict] = None

class EntityResults(BaseModel):
    entity: str
    algorithm: str
    known_voices: int
    unique_terms: int
    total_citations: int
    coverage: float
    results: List[ResultRow]

# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/results")
async def get_all_results(
    run_id: Optional[str] = None,
    entity: Optional[str] = None,
    limit: int = 100,
    cursor: Optional[str] = None,
    page: Optional[int] = None,
    q: Optional[str] = None,
):
    """
    Obtiene resultados de similitud.

    Si existen tablas Delta, devuelve una página consultable. Si no existen,
    conserva el fallback legacy al JSON completo para desarrollo/migración.
    """
    if has_delta_similarity_results():
        try:
            return query_delta_results(
                run_id=run_id,
                entity=entity,
                limit=limit,
                cursor=cursor,
                page=page,
                q=q,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except FileNotFoundError:
            raise HTTPException(
                status_code=404,
                detail="No hay resultados Delta disponibles. Ejecuta el proceso de análisis primero.",
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"No se pudieron leer resultados Delta: {exc}",
            )

    try:
        return load_results_data()
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="No hay resultados disponibles. Ejecuta el proceso de análisis primero.",
        )
    except InvalidResultsFileError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": exc.message,
                "file": exc.file_name,
                "action": "Regenera el análisis de similitud; el archivo actual no es JSON válido.",
            },
        )

@router.get("/status")
async def get_status():
    """
    Verifica si hay resultados disponibles
    """
    if has_delta_similarity_results():
        try:
            latest_run_id = get_latest_delta_run_id()
            return {
                "has_results": bool(latest_run_id),
                "source": "delta",
                "results_root": get_delta_similarity_root(),
                "latest_run_id": latest_run_id,
            }
        except Exception as exc:
            return {
                "has_results": False,
                "source": "delta",
                "message": f"No se pudieron leer resultados Delta: {exc}",
            }

    results_file = get_results_file()

    if not results_file.exists():
        return {
            "has_results": False,
            "message": "No hay resultados disponibles. Ejecuta: docker compose exec api python /app/scripts/generate_similarity_with_datalayer.py --output-dir /app/similarity_results",
        }

    try:
        data = load_results_data()
    except InvalidResultsFileError as exc:
        return {
            "has_results": False,
            "invalid_results_file": True,
            "results_file": exc.file_name,
            "message": exc.message,
            "action": "Regenera el análisis de similitud; el archivo actual no es JSON válido.",
        }

    return {
        "has_results": True,
        "source": data.get("source"),
        "results_file": results_file.name,
        "timestamp": data.get("timestamp"),
        "total_entries": data.get("total_entries"),
    }


@router.get("/runs")
async def list_similarity_runs(limit: int = 20):
    """Lista ejecuciones Delta de similitud, de más reciente a más antigua."""
    if not delta_table_exists("similarity_runs"):
        return {"source": "delta", "runs": []}

    safe_limit = max(1, min(int(limit), 100))
    rows = (
        read_delta_table("similarity_runs")
        .orderBy(F.desc("created_at"))
        .limit(safe_limit)
        .collect()
    )
    return {"source": "delta", "runs": [row_to_dict(row) for row in rows]}


@router.get("/runs/latest")
async def get_latest_similarity_run():
    """Devuelve la última ejecución Delta de similitud."""
    if not delta_table_exists("similarity_runs"):
        raise HTTPException(status_code=404, detail="No hay ejecuciones Delta disponibles")

    rows = (
        read_delta_table("similarity_runs")
        .orderBy(F.desc("created_at"))
        .limit(1)
        .collect()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No hay ejecuciones Delta disponibles")
    return row_to_dict(rows[0])

@router.get("/entities", response_model=List[EntityInfo])
async def list_entities():
    """
    Lista todas las entidades disponibles
    """
    entity_names = {
        "port": "Puertos",
        "ship_type": "Tipos de Barco",
        "flag": "Banderas",
        "ship_tons": "Tonelaje",
        "master_role": "Rol del Capitán",
        "comodity": "Mercancías",
        "unit": "Unidades",
        "travel_duration": "Duración del Viaje"
    }

    if delta_table_exists("similarity_entity_summaries"):
        rows = (
            latest_successful_entity_runs_df()
            .select("entity_type")
            .collect()
        )
        entities = [
            {
                "name": row["entity_type"],
                "display_name": entity_names.get(row["entity_type"], str(row["entity_type"]).title()),
                "has_results": True,
            }
            for row in rows
        ]
        return sorted(entities, key=lambda x: x["name"])

    if not RESULTS_DIR.exists():
        return []

    entity_files = list(RESULTS_DIR.glob("entity_*.json"))

    entities = []
    for f in entity_files:
        entity_name = f.stem.replace("entity_", "")
        entities.append({
            "name": entity_name,
            "display_name": entity_names.get(entity_name, entity_name.title()),
            "has_results": True
        })

    return sorted(entities, key=lambda x: x["name"])

@router.get("/algorithms", response_model=List[AlgorithmInfo])
async def list_algorithms():
    """
    Lista todos los algoritmos disponibles
    """
    # Leer configuración de algoritmos
    config_file = Path("/app/config/config_similarity.json")

    if not config_file.exists():
        return []

    with open(config_file, encoding="utf-8") as f:
        config = json.load(f)

    algorithms = []
    for alg_name, alg_config in config.get("algorithms", {}).items():
        algorithms.append({
            "name": alg_name,
            "enabled": alg_config.get("enabled", False)
        })

    return algorithms

@router.get("/results/{entity_name}")
async def get_entity_results(
    entity_name: str,
    algorithms: Optional[str] = None,  # Comma-separated list; legacy JSON only for now
    run_id: Optional[str] = None,
    limit: int = 100,
    cursor: Optional[str] = None,
    page: Optional[int] = None,
    q: Optional[str] = None,
):
    """
    Obtiene resultados de una entidad, opcionalmente filtrados por algoritmos
    """
    if has_delta_similarity_results():
        try:
            return query_delta_results(
                run_id=run_id,
                entity=entity_name,
                limit=limit,
                cursor=cursor,
                page=page,
                q=q,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except FileNotFoundError:
            raise HTTPException(
                status_code=404,
                detail=f"No hay resultados Delta para la entidad '{entity_name}'",
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"No se pudieron leer resultados Delta: {exc}",
            )

    entity_file = RESULTS_DIR / f"entity_{entity_name}.json"

    if not entity_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No hay resultados para la entidad '{entity_name}'"
        )

    with open(entity_file, encoding="utf-8") as f:
        data = json.load(f)

    # Si no hay filtro de algoritmos, devolver todo
    if not algorithms:
        return data

    # Filtrar por algoritmos seleccionados
    selected_algorithms = [a.strip() for a in algorithms.split(",")]

    # Filtrar resultados según algoritmos
    # (esto requiere que los resultados incluyan información de algoritmos)
    filtered_data = data.copy()

    # Filtrar top_matches, gray_zone_cases, rejected_cases
    if "top_matches" in filtered_data:
        filtered_data["top_matches"] = [
            r for r in filtered_data["top_matches"]
            if any(alg in str(r.get("algorithms_votes", {})) for alg in selected_algorithms)
        ] if selected_algorithms else filtered_data["top_matches"]

    return filtered_data

@router.get("/export/{entity_name}")
async def export_to_excel(
    entity_name: str,
    algorithms: Optional[str] = None,
    classification: Optional[str] = None,
    run_id: Optional[str] = None,
    q: Optional[str] = None,
):
    """
    Exporta resultados de una entidad a Excel
    """
    selected_algorithms = [item.strip() for item in (algorithms or "").split(",") if item.strip()]

    if has_delta_similarity_results():
        try:
            rows = query_delta_export_rows(run_id=run_id, entity=entity_name, q=q)
        except FileNotFoundError:
            raise HTTPException(
                status_code=404,
                detail=f"No hay resultados Delta para la entidad '{entity_name}'",
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"No se pudieron exportar resultados Delta: {exc}",
            )

        return StreamingResponse(
            csv_stream(rows, selected_algorithms, classification),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename=similarity_{entity_name}.csv"
            },
        )

    entity_file = RESULTS_DIR / f"entity_{entity_name}.json"

    if not entity_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No hay resultados para la entidad '{entity_name}'"
        )

    with open(entity_file, encoding="utf-8") as f:
        data = json.load(f)

    # Crear Excel en memoria
    output = io.BytesIO()

    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Hoja 1: Resumen
        summary_data = {
            "Métrica": [
                "Entidad",
                "Estado",
                "Voces Conocidas",
                "Términos Únicos",
                "Citaciones Totales",
                "Cobertura (%)"
            ],
            "Valor": [
                data.get("name", ""),
                data.get("status", ""),
                data.get("known_voices", 0),
                data.get("unique_terms", 0),
                data.get("total_citations", 0),
                data.get("coverage", 0)
            ]
        }
        df_summary = pd.DataFrame(summary_data)
        df_summary.to_excel(writer, sheet_name="Resumen", index=False)

        # Hoja 2: Clasificación
        classification = data.get("classification", {})
        if classification:
            df_classification = pd.DataFrame([
                {"Clasificación": k, "Cantidad": v}
                for k, v in classification.items()
            ])
            df_classification.to_excel(writer, sheet_name="Clasificación", index=False)

        # Hoja 3: Top Matches
        top_matches = data.get("top_matches", [])
        if top_matches:
            df_top = pd.DataFrame(top_matches)
            df_top.to_excel(writer, sheet_name="Top Matches", index=False)

        # Hoja 4: Zona Gris
        gray_zone = data.get("gray_zone_cases", [])
        if gray_zone:
            df_gray = pd.DataFrame(gray_zone)
            df_gray.to_excel(writer, sheet_name="Zona Gris", index=False)

        # Hoja 5: Rechazados
        rejected = data.get("rejected_cases", [])
        if rejected:
            df_rejected = pd.DataFrame(rejected)
            df_rejected.to_excel(writer, sheet_name="Rechazados", index=False)

    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=similarity_{entity_name}.xlsx"
        }
    )
