
from fastapi import APIRouter, HTTPException, Query, Body, File, UploadFile
from typing import Optional, List
from ..services.datalayer import DataLayerService
from pydantic import BaseModel

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
    
    try:
        service = DataLayerService.get_instance()
        return service.get_missing_dates(publication, date_list=content_str)
    except Exception as e:
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
