from typing import Optional

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
import pandas as pd
import io

from ..services.similarity import SimilarityService

router = APIRouter()


class SimilarityRunRequest(BaseModel):
    entity: Optional[str] = None
    citation_field: Optional[str] = None
    known_entity: Optional[str] = None
    use_clean_entries: bool = True
    publication_name: Optional[str] = None
    user: Optional[str] = None
    y: Optional[int] = None
    m: Optional[int] = None
    d: Optional[int] = None
    edition: Optional[str] = None
    force_refit: bool = False


@router.get("/config")
async def get_similarity_config():
    try:
        service = SimilarityService.get_instance()
        return service.get_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config")
async def save_similarity_config(config: dict):
    try:
        service = SimilarityService.get_instance()
        return service.save_config(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status")
async def get_similarity_status():
    try:
        service = SimilarityService.get_instance()
        return service.status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/entities")
async def get_similarity_entities():
    try:
        service = SimilarityService.get_instance()
        return {"entities": service.get_entities()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run")
async def run_similarity(payload: SimilarityRunRequest):
    try:
        service = SimilarityService.get_instance()
        return service.run_similarity(
            entity=payload.entity,
            citation_field=payload.citation_field,
            known_entity=payload.known_entity,
            use_clean_entries=payload.use_clean_entries,
            publication_name=payload.publication_name,
            user=payload.user,
            y=payload.y,
            m=payload.m,
            d=payload.d,
            edition=payload.edition,
            force_refit=payload.force_refit,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/export")
async def export_similarity(payload: SimilarityRunRequest, format: str = "csv"):
    try:
        service = SimilarityService.get_instance()
        data = service.run_similarity(
            entity=payload.entity,
            citation_field=payload.citation_field,
            known_entity=payload.known_entity,
            use_clean_entries=payload.use_clean_entries,
            publication_name=payload.publication_name,
            user=payload.user,
            y=payload.y,
            m=payload.m,
            d=payload.d,
            edition=payload.edition,
            force_refit=payload.force_refit,
        )

        results = data.get("results", [])
        if not results:
            raise HTTPException(
                status_code=404, detail="No hay resultados para exportar"
            )

        # Aplanamos los algorithm_scores para el CSV
        flattened_results = []
        for r in results:
            row = {
                "term": r["term"],
                "frequency": r["frequency"],
                "entity": r["entity"],
                "best_voice": r["best_voice"],
                "classification": r["classification"],
                "consensus": r["consensus"],
                "votes_approval": r["votes_approval"],
                "votes_entity": r["votes_entity"],
            }
            # Agregar scores individuales
            for algo, score_data in r.get("algorithm_scores", {}).items():
                row[f"score_{algo}"] = score_data.get("score")
            flattened_results.append(row)

        df = pd.DataFrame(flattened_results)

        if format.lower() == "csv":
            stream = io.StringIO()
            df.to_csv(stream, index=False)
            response = Response(content=stream.getvalue(), media_type="text/csv")
            filename = f"similarity_{payload.entity or 'results'}.csv"
            response.headers["Content-Disposition"] = f"attachment; filename={filename}"
            return response
        else:
            # JSON format
            return {"results": flattened_results}

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
