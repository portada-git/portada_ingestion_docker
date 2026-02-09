
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from ..services.datalayer import DataLayerService

router = APIRouter()

# 3. Duplicates
@router.get("/duplicates/metadata")
async def get_duplicates_metadata(
    publication: Optional[str] = None,
    user: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    try:
        service = DataLayerService.get_instance()
        return service.get_duplicate_metadata(publication, user, start_date, end_date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/duplicates/records")
async def get_duplicate_records(duplicates_filter: str):
    """
    Obtiene los detalles de duplicados usando el filtro.
    El duplicates_filter viene de la columna duplicates_filter del endpoint /duplicates/metadata
    """
    try:
        service = DataLayerService.get_instance()
        return service.get_duplicate_details(duplicates_filter)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 6. Storage Audit
@router.get("/storage")
async def audit_storage(
    table_name: Optional[str] = None,
    process: Optional[str] = None
):
    try:
        service = DataLayerService.get_instance()
        return service.get_storage_audit(table_name, process)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/storage/{log_id}/lineage")
async def audit_storage_lineage(log_id: str):
    try:
        service = DataLayerService.get_instance()
        return service.get_lineage_detail(log_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 7. Process Audit
@router.get("/process")
async def audit_process(
    process: Optional[str] = None
):
    try:
        service = DataLayerService.get_instance()
        return service.get_process_audit(process)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
