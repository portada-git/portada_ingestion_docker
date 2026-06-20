from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .routers import ingest, queries, audit, similarity_results
from .services.datalayer import DataLayerService
import logging

logger = logging.getLogger(__name__)

app = FastAPI(
    title="PortAda API",
    description="API for PortAda Delta Lake System",
    version="1.0.0",
)

# CORS - Simplified configuration for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # Changed to False to allow wildcard origins
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(ingest.router, prefix="/api/v1/ingest", tags=["Ingestion"])
app.include_router(queries.router, prefix="/api/v1/queries", tags=["Queries"])
app.include_router(audit.router, prefix="/api/v1/audit", tags=["Audit"])
app.include_router(similarity_results.router, tags=["Similarity"])


@app.get("/api/v1/health")
def health_check():
    return {"status": "healthy", "service": "backend"}


@app.on_event("shutdown")
async def shutdown_event():
    """
    Event handler que se ejecuta cuando el contenedor se detiene.
    Cierra todas las sesiones de Spark para liberar recursos en el cluster.
    """
    logger.info("Iniciando shutdown de la aplicación...")
    try:
        service = DataLayerService.get_instance()
        service.shutdown()
        logger.info("✓ Shutdown completado exitosamente")
    except Exception as e:
        logger.error(f"Error durante el shutdown: {str(e)}")
