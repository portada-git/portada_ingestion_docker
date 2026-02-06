
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

@router.get("/entities/{type}/download")
async def download_entity_yaml(type: str):
    # This would simulate downloading the YAML list. 
    # Current DataLayer mock doesn't really have a "get all items for type" easily exposed as list of dicts -> YAML.
    # Assuming list_known_entities just gives stats.
    # We might need a real method in DataLayer to fetch the data.
    # For now returning a placeholder or implementing a basic fetch if possible.
    return {"message": f"Download YAML for {type} not fully implemented yet"}

@router.get("/known-entities")
async def get_known_entities_alt():
    service = DataLayerService.get_instance()
    return service.get_known_entities()

@router.get("/publications")
async def query_publications():
    service = DataLayerService.get_instance()
    return service.get_publications()
