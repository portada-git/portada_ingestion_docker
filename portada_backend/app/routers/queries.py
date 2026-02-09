
from fastapi import APIRouter, HTTPException, Query, Body, File, UploadFile
from typing import Optional, List
from ..services.datalayer import DataLayerService
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class GapsRequest(BaseModel):
    publication: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    date_list: Optional[str] = None 

# 2. Gaps
@router.get("/gaps")
async def get_gaps_range(
    publication: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Obtiene las fechas faltantes de una publicación.
    IMPORTANTE: Se recomienda siempre usar start_date y end_date.
    """
    try:
        service = DataLayerService.get_instance()
        return service.get_missing_dates(publication, start_date=start_date, end_date=end_date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/gaps/file")
async def get_gaps_file(
    publication: str = Query(...),
    file: UploadFile = File(...)
):
    # Read file content
    content = await file.read()
    content_str = content.decode('utf-8')
    
    # Detectar el formato del archivo
    content_str = content_str.strip()
    
    logger.info(f"Contenido original del archivo: {content_str[:200]}")
    
    # Si ya es YAML o JSON válido, usarlo directamente
    if content_str.startswith('{') or content_str.startswith('[') or ':' in content_str:
        # Ya tiene formato estructurado
        yaml_content = content_str
        logger.info(f"Usando formato estructurado")
    else:
        # Formato simple: una fecha por línea
        # Convertir a formato YAML: fecha: [u]
        lines = [line.strip() for line in content_str.split('\n') if line.strip()]
        yaml_content = '\n'.join([f'"{line}": ["u"]' for line in lines])
        logger.info(f"Convertido a YAML: {yaml_content[:200]}")
    
    try:
        service = DataLayerService.get_instance()
        result = service.get_missing_dates(publication, date_list=yaml_content)
        logger.info(f"Resultado: {result}")
        return result
    except Exception as e:
        logger.error(f"Error: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# 4. Count Entries
@router.get("/entries/count")
async def count_entries(
    publication: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    try:
        service = DataLayerService.get_instance()
        return service.count_entries(publication, start_date, end_date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 5. Entities
@router.get("/entities")
async def list_entities():
    try:
        service = DataLayerService.get_instance()
        return service.list_known_entities()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/entities/{entity_type}")
async def get_entity_data(entity_type: str):
    try:
        service = DataLayerService.get_instance()
        return service.get_entity_data(entity_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/known-entities")
async def get_known_entities_alt():
    try:
        service = DataLayerService.get_instance()
        return service.list_known_entities()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/publications")
async def query_publications():
    try:
        service = DataLayerService.get_instance()
        return service.get_publications()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
