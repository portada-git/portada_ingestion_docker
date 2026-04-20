"""
Router para servir resultados de análisis de similitud al frontend
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import json
from typing import Dict, List, Optional
from pydantic import BaseModel

router = APIRouter(prefix="/api/similarity", tags=["similarity"])

RESULTS_DIR = Path(__file__).parent.parent.parent / "similarity_results"

# ═══════════════════════════════════════════════════════════════════════════
# MODELOS
# ═══════════════════════════════════════════════════════════════════════════

class EntitySummary(BaseModel):
    name: str
    status: str
    known_voices: int
    unique_terms: int
    coverage: float
    classification: Dict[str, int]

class Summary(BaseModel):
    timestamp: str
    total_entries: int
    entities_summary: List[EntitySummary]

class MatchResult(BaseModel):
    term: str
    frequency: int
    classification: str
    canonical_entity: Optional[str] = None
    similarity_score: Optional[float] = None
    algorithms_votes: Optional[Dict[str, any]] = None

class EntityDetail(BaseModel):
    name: str
    status: str
    error: Optional[str] = None
    known_voices: int
    unique_terms: int
    total_citations: int
    coverage: float
    classification: Dict[str, int]
    top_matches: List[MatchResult]
    gray_zone_cases: List[MatchResult]
    rejected_cases: List[MatchResult]

# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/summary", response_model=Summary)
async def get_summary():
    """
    Obtiene el resumen del análisis de similitud
    """
    summary_file = RESULTS_DIR / "summary.json"
    
    if not summary_file.exists():
        raise HTTPException(
            status_code=404,
            detail="No hay resultados disponibles. Ejecuta el proceso de análisis primero."
        )
    
    with open(summary_file, encoding="utf-8") as f:
        data = json.load(f)
    
    return data

@router.get("/entity/{entity_name}", response_model=EntityDetail)
async def get_entity_detail(entity_name: str):
    """
    Obtiene el detalle completo de una entidad específica
    """
    entity_file = RESULTS_DIR / f"entity_{entity_name}.json"
    
    if not entity_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No hay resultados para la entidad '{entity_name}'"
        )
    
    with open(entity_file, encoding="utf-8") as f:
        data = json.load(f)
    
    return data

@router.get("/entities")
async def list_entities():
    """
    Lista todas las entidades disponibles
    """
    if not RESULTS_DIR.exists():
        return {"entities": []}
    
    entity_files = list(RESULTS_DIR.glob("entity_*.json"))
    entities = [f.stem.replace("entity_", "") for f in entity_files]
    
    return {"entities": sorted(entities)}

@router.get("/download/full")
async def download_full_results():
    """
    Descarga el archivo completo de resultados
    """
    results_file = RESULTS_DIR / "similarity_analysis_results.json"
    
    if not results_file.exists():
        raise HTTPException(
            status_code=404,
            detail="No hay resultados disponibles"
        )
    
    return FileResponse(
        path=results_file,
        filename="similarity_analysis_results.json",
        media_type="application/json"
    )

@router.get("/status")
async def get_status():
    """
    Verifica si hay resultados disponibles y cuándo se generaron
    """
    summary_file = RESULTS_DIR / "summary.json"
    
    if not summary_file.exists():
        return {
            "available": False,
            "message": "No hay resultados disponibles. Ejecuta el proceso de análisis."
        }
    
    with open(summary_file, encoding="utf-8") as f:
        data = json.load(f)
    
    return {
        "available": True,
        "timestamp": data.get("timestamp"),
        "total_entries": data.get("total_entries"),
        "entities_count": len(data.get("entities_summary", []))
    }

@router.get("/results")
async def get_results():
    """
    Obtiene el archivo completo de resultados JSON
    """
    results_file = RESULTS_DIR / "similarity_results.json"
    
    if not results_file.exists():
        raise HTTPException(
            status_code=404,
            detail="No hay resultados disponibles. Ejecuta el proceso de análisis primero."
        )
    
    with open(results_file, encoding="utf-8") as f:
        data = json.load(f)
    
    return data

@router.post("/trigger-analysis")
async def trigger_analysis():
    """
    Endpoint para disparar el proceso de análisis (futuro)
    """
    return {
        "message": "Por ahora, ejecuta el script manualmente: run_generate_similarity.bat",
        "status": "not_implemented"
    }
