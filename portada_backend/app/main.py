
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .routers import ingest, queries, audit

app = FastAPI(
    title="PortAda API",
    description="API for PortAda Delta Lake System",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router, prefix="/api/v1/ingest", tags=["Ingestion"])
app.include_router(queries.router, prefix="/api/v1/queries", tags=["Queries"])
app.include_router(audit.router, prefix="/api/v1/audit", tags=["Audit"])

@app.get("/api/v1/health")
def health_check():
    return {"status": "healthy", "service": "backend"}
