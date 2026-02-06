
from fastapi import APIRouter, UploadFile, File, Header, HTTPException, Depends, Query
from typing import List
from ..redis_client import get_redis
import redis
import os
import shutil
import uuid
import time
import json

router = APIRouter()

# Use the Delta Lake ingest path
BASE_FILE_PATH = "/app/delta_lake/ingest"

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
        
    uploaded_ids = []
    
    # Path: ingest/ship_entries/<username>/
    directory = os.path.join(BASE_FILE_PATH, "ship_entries", user)
    os.makedirs(directory, exist_ok=True)
    
    for file in files:
        if not file.filename.endswith(".json"):
             raise HTTPException(status_code=400, detail=f"File {file.filename} is not a JSON file")

        file_path = os.path.join(directory, file.filename)
        
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"File save error for {file.filename}: {str(e)}")
            
        # Record in Redis
        file_id = str(uuid.uuid4())
        
        metadata = {
            "id": file_id,
            "filename": file.filename,
            "file_path": file_path,
            "file_type": "entry",
            "status": 0,
            "user": user,
            "timestamp": time.time()
        }
        
        # Store as Hash
        r.hset(f"file:{file_id}", mapping=metadata)
        # Add to list of files
        r.rpush("files:all", file_id)
        r.rpush(f"files:user:{user}", file_id)
        
        uploaded_ids.append(file_id)
    
    return {"message": "Entries uploaded successfully", "file_ids": uploaded_ids, "count": len(uploaded_ids)}

@router.post("/entity")
async def upload_entity(
    type: str = Query(..., description="Entity Type"),
    file: UploadFile = File(...),
    user: str = Depends(get_current_user_name),
    r: redis.Redis = Depends(get_redis)
):
    if not (file.filename.endswith(".yaml") or file.filename.endswith(".yml") or file.filename.endswith(".json")):
        raise HTTPException(status_code=400, detail="YAML/JSON files allowed for entities")

    # Path: ingest/entity/<type>/
    directory = os.path.join(BASE_FILE_PATH, "entity", type)
    os.makedirs(directory, exist_ok=True)
    
    file_path = os.path.join(directory, file.filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File save error: {str(e)}")
        
    # Record in Redis
    file_id = str(uuid.uuid4())
    metadata = {
        "id": file_id,
        "filename": file.filename,
        "file_path": file_path,
        "file_type": f"entity_{type}",
        "status": 0,
        "user": user,
        "timestamp": time.time()
    }
    
    r.hset(f"file:{file_id}", mapping=metadata)
    r.rpush("files:all", file_id)
    r.rpush(f"files:user:{user}", file_id)
    
    return {"message": "Entity uploaded successfully", "file_id": file_id}

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
