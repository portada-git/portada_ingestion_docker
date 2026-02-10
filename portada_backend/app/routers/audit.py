
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
        records = service.get_storage_audit(table_name, process)
        
        # Devolver en el formato esperado por el frontend
        return {
            "storage_records": records,
            "total_records": len(records),
            "filters_applied": {
                "table_name": table_name,
                "process_name": process
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/storage/{log_id}/lineage")
async def audit_storage_lineage(log_id: str):
    try:
        service = DataLayerService.get_instance()
        lineages = service.get_lineage_detail(log_id)
        
        # Devolver en el formato esperado por el frontend
        return {
            "field_lineages": lineages
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 7. Process Audit
@router.get("/process")
async def audit_process(
    process: Optional[str] = None
):
    try:
        service = DataLayerService.get_instance()
        records = service.get_process_audit(process)
        
        # Devolver en el formato esperado por el frontend
        return {
            "process_metadata": records,
            "total_count": len(records)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
