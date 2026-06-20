"""
Router simplificado para resultados de similitud
Frontend solo lee datos, sin procesamiento
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pathlib import Path
import json
import io
import pandas as pd
from typing import List, Dict, Optional
from pydantic import BaseModel

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


def get_results_file() -> Path:
    """Return the canonical datalayer output, falling back to the legacy file."""
    canonical_file = RESULTS_DIR / CANONICAL_RESULTS_FILE
    if canonical_file.exists():
        return canonical_file

    return RESULTS_DIR / LEGACY_RESULTS_FILE

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
async def get_all_results():
    """
    Obtiene el archivo completo de resultados JSON
    """
    results_file = get_results_file()

    if not results_file.exists():
        raise HTTPException(
            status_code=404,
            detail="No hay resultados disponibles. Ejecuta el proceso de análisis primero."
        )
    
    with open(results_file, encoding="utf-8") as f:
        data = json.load(f)
    
    return data

@router.get("/status")
async def get_status():
    """
    Verifica si hay resultados disponibles
    """
    results_file = get_results_file()

    if not results_file.exists():
        return {
            "has_results": False,
            "message": "No hay resultados disponibles. Ejecuta: docker compose exec api python /app/scripts/generate_similarity_with_datalayer.py --output-dir /app/similarity_results"
        }

    with open(results_file, encoding="utf-8") as f:
        data = json.load(f)

    return {
        "has_results": True,
        "source": data.get("source"),
        "results_file": results_file.name,
        "timestamp": data.get("timestamp"),
        "total_entries": data.get("total_entries")
    }

@router.get("/entities", response_model=List[EntityInfo])
async def list_entities():
    """
    Lista todas las entidades disponibles
    """
    if not RESULTS_DIR.exists():
        return []
    
    entity_files = list(RESULTS_DIR.glob("entity_*.json"))
    
    entities = []
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
    algorithms: Optional[str] = None  # Comma-separated list
):
    """
    Obtiene resultados de una entidad, opcionalmente filtrados por algoritmos
    """
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
    algorithms: Optional[str] = None
):
    """
    Exporta resultados de una entidad a Excel
    """
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
