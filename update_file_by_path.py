#!/usr/bin/env python3
"""
Actualizar archivo en Redis por file_path - VERSIÓN SIMPLE
"""

import redis

# Conectar a Redis
r = redis.Redis(host='localhost', port=6379, db=0)


def update_file(file_path: str, updates: dict):
    """
    Actualiza un archivo buscándolo por file_path
    
    Ejemplo:
        update_file("/app/ingestion/ship_entries/john/data.json", {"status": "2"})
    """
    # Buscar el archivo
    for file_key in r.keys("file:*"):
        stored_path = r.hget(file_key, "file_path")
        if stored_path and stored_path.decode('utf-8') == file_path:
            # Actualizar
            r.hset(file_key, mapping=updates)
            print(f"✓ Actualizado: {file_key.decode('utf-8')}")
            return True
    
    print(f"✗ No encontrado: {file_path}")
    return False


# ============================================================================
# EJEMPLOS DE USO
# ============================================================================

if __name__ == "__main__":
    
    # Ejemplo 1: Cambiar status a Completed
    update_file("/app/ingestion/ship_entries/john/data.json", {"status": "2"})
    
    # Ejemplo 2: Cambiar status a Processing
    update_file("/app/ingestion/ship_entries/john/data.json", {"status": "1"})
    
    # Ejemplo 3: Actualizar múltiples campos
    update_file("/app/ingestion/ship_entries/john/data.json", {
        "status": "2",
        "notes": "Procesado correctamente"
    })
