
from fastapi import APIRouter, UploadFile, File, Header, HTTPException, Depends, Query
from typing import List, Optional
from ..redis_client import get_redis
import redis
import os
import shutil
import uuid
import time
import json

router = APIRouter()

# Use the ingestion path from environment variable (defaults to /app/ingestion)
BASE_FILE_PATH = os.getenv("PATH_TO_INGEST", "/app/ingestion")

def get_current_user_name(x_api_key: str = Header(...), r: redis.Redis = Depends(get_redis)):
    """
    User logs in with username only (x-api-key).
    We check if user exists in Redis set "users". If not, add them.
    """
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing API Key (Username)")
    
    # Add to set of users (idempotent)
    r.sadd("users", x_api_key)
    
    return x_api_key

@router.post("/entry")
async def upload_entry(
    files: List[UploadFile] = File(...),
    user: str = Depends(get_current_user_name),
    r: redis.Redis = Depends(get_redis)
):
    # Requirement: Max 20 files
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 files allowed per upload")
        
    uploaded_files = []
    
    # Path: ingest/ship_entries/<username>/
    directory = os.path.join(BASE_FILE_PATH, "ship_entries", user)
    os.makedirs(directory, exist_ok=True)
    
    for file in files:
        if not file.filename.endswith(".json"):
             raise HTTPException(status_code=400, detail=f"File {file.filename} is not a JSON file")

        # Generar nombre aleatorio para el archivo (este será la key de Redis)
        random_filename = f"{uuid.uuid4()}.json"
        file_path = os.path.join(directory, random_filename)
        
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"File save error for {file.filename}: {str(e)}")
            
        # Metadata para Redis
        metadata = {
            "original_filename": file.filename,  # Nombre original para mostrar al usuario
            "stored_filename": random_filename,  # Nombre con el que se guardó
            "file_path": file_path,
            "file_type": "entry",
            "status": "0",  # 0=Pending, 1=Processing, 2=Completed, 3=Error
            "user": user,
            "timestamp": str(time.time())
        }
        
        # Usar el nombre del archivo como key de Redis (sin extensión para más limpieza)
        file_key = random_filename.replace(".json", "")
        
        # Store as Hash - La key es el nombre del archivo
        r.hset(f"file:{file_key}", mapping=metadata)
        # Add to list of files
        r.rpush("files:all", file_key)
        r.rpush(f"files:user:{user}", file_key)
        
        uploaded_files.append({
            "file_key": file_key,
            "original_filename": file.filename,
            "stored_filename": random_filename
        })
    
    return {
        "message": "Entries uploaded successfully", 
        "files": uploaded_files, 
        "count": len(uploaded_files)
    }


@router.post("/entity")
async def upload_entity(
    type: str = Query(..., description="Entity Type"),
    file: UploadFile = File(...),
    user: str = Depends(get_current_user_name),
    r: redis.Redis = Depends(get_redis)
):
    if not (file.filename.endswith(".yaml") or file.filename.endswith(".yml") or file.filename.endswith(".json")):
        raise HTTPException(status_code=400, detail="YAML/JSON files allowed for entities")

    # Determinar extensión del archivo original
    file_extension = ""
    if file.filename.endswith(".yaml") or file.filename.endswith(".yml"):
        file_extension = ".yaml"
    elif file.filename.endswith(".json"):
        file_extension = ".json"
    
    # Generar nombre aleatorio para el archivo (este será la key de Redis)
    random_filename = f"{uuid.uuid4()}{file_extension}"
    
    # Path: ingest/entity/<type>/
    directory = os.path.join(BASE_FILE_PATH, "entity", type)
    os.makedirs(directory, exist_ok=True)
    
    file_path = os.path.join(directory, random_filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File save error: {str(e)}")
        
    # Metadata para Redis
    metadata = {
        "original_filename": file.filename,  # Nombre original para mostrar al usuario
        "stored_filename": random_filename,  # Nombre con el que se guardó
        "file_path": file_path,
        "file_type": f"entity_{type}",
        "status": "0",  # 0=Pending, 1=Processing, 2=Completed, 3=Error
        "user": user,
        "timestamp": str(time.time())
    }
    
    # Usar el nombre del archivo como key de Redis (sin extensión)
    file_key = random_filename.replace(file_extension, "")
    
    # Store as Hash - La key es el nombre del archivo
    r.hset(f"file:{file_key}", mapping=metadata)
    r.rpush("files:all", file_key)
    r.rpush(f"files:user:{user}", file_key)
    
    return {
        "message": "Entity uploaded successfully", 
        "file_key": file_key,
        "original_filename": file.filename,
        "stored_filename": random_filename
    }

# Auth endpoints
@router.post("/auth/me")
async def auth_me(user: str = Depends(get_current_user_name)):
    return {
        "username": user,
        "role": "user",
        "permissions": ["read", "write", "upload"],
        "full_name": user,
        "email": ""
    }

@router.get("/auth/me")
async def auth_me_get(user: str = Depends(get_current_user_name)):
    return {
        "username": user,
        "role": "user",
        "permissions": ["read", "write", "upload"],
        "full_name": user,
        "email": ""
    }

@router.post("/auth/logout")
async def logout():
    return {"message": "Logged out"}

@router.get("/files")
async def list_files(
    status: Optional[int] = Query(None, description="Filter by status (0=pending, 1=processing, 2=completed, 3=error)"),
    user: Optional[str] = Query(None, description="Filter by user"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    r: redis.Redis = Depends(get_redis)
):
    """
    List all uploaded files from Redis with pagination
    """
    # Get all file keys
    all_file_keys = r.lrange("files:all", 0, -1)
    
    # Decode bytes to strings
    all_file_keys = [fk.decode('utf-8') if isinstance(fk, bytes) else fk for fk in all_file_keys]
    
    # Get file metadata for each key
    files = []
    for file_key in all_file_keys:
        file_data = r.hgetall(f"file:{file_key}")
        if file_data:
            # Decode bytes to strings and convert types
            decoded_data = {"file_key": file_key}  # Añadir el file_key al resultado
            for key, value in file_data.items():
                key_str = key.decode('utf-8') if isinstance(key, bytes) else key
                value_str = value.decode('utf-8') if isinstance(value, bytes) else value
                
                # Convert status to int and timestamp to float
                if key_str == 'status':
                    decoded_data[key_str] = int(value_str)
                elif key_str == 'timestamp':
                    decoded_data[key_str] = float(value_str)
                else:
                    decoded_data[key_str] = value_str
            
            # Apply filters
            if status is not None and decoded_data.get('status', 0) != status:
                continue
            if user and decoded_data.get('user') != user:
                continue
            
            files.append(decoded_data)
    
    # Sort by timestamp (newest first)
    files.sort(key=lambda x: float(x.get('timestamp', 0)), reverse=True)
    
    # Pagination
    total = len(files)
    start = (page - 1) * page_size
    end = start + page_size
    paginated_files = files[start:end]
    
    return {
        "files": paginated_files,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }
