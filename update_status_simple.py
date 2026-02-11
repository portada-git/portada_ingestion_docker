#!/usr/bin/env python3
"""
Script simple para actualizar el status de un archivo usando su file_key
"""

import redis

# Conectar a Redis
r = redis.Redis(host='localhost', port=6379, db=0)


def update_status(file_key: str, new_status: int):
    """
    Actualiza el status de un archivo
    
    Args:
        file_key: La key del archivo (UUID sin extensión)
        new_status: 0=en cola, 1=procesado, 2=error
    
    Ejemplo:
        update_status("a1b2c3d4-e5f6-7890-abcd-ef1234567890", 1)
    """
    # Verificar que el archivo existe
    if not r.exists(f"file:{file_key}"):
        print(f"✗ Archivo no encontrado: {file_key}")
        return False
    
    # Actualizar el status
    r.hset(f"file:{file_key}", "status", str(new_status))
    
    status_names = {0: "En Cola", 1: "Procesado", 2: "Error"}
    print(f"✓ Status actualizado a {new_status} ({status_names.get(new_status, 'Unknown')})")
    
    # Mostrar info del archivo
    file_data = r.hgetall(f"file:{file_key}")
    original_filename = file_data.get(b"original_filename", b"N/A").decode('utf-8')
    print(f"  Archivo: {original_filename}")
    print(f"  Key: {file_key}")
    
    return True


def list_files():
    """Lista todos los archivos con su status"""
    file_keys = r.lrange("files:all", 0, -1)
    
    if not file_keys:
        print("No hay archivos en Redis")
        return
    
    print(f"\nTotal de archivos: {len(file_keys)}\n")
    print("-" * 80)
    
    status_names = {0: "En Cola", 1: "Procesado", 2: "Error"}
    
    for file_key in file_keys:
        file_key_str = file_key.decode('utf-8') if isinstance(file_key, bytes) else file_key
        file_data = r.hgetall(f"file:{file_key_str}")
        
        if file_data:
            original_filename = file_data.get(b"original_filename", b"N/A").decode('utf-8')
            status = int(file_data.get(b"status", b"0").decode('utf-8'))
            user = file_data.get(b"user", b"N/A").decode('utf-8')
            
            print(f"Key:    {file_key_str}")
            print(f"File:   {original_filename}")
            print(f"Status: {status} ({status_names.get(status, 'Unknown')})")
            print(f"User:   {user}")
            print("-" * 80)


# ============================================================================
# EJEMPLOS DE USO
# ============================================================================

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Uso:")
        print("  python update_status_simple.py list")
        print("  python update_status_simple.py <file_key> <status>")
        print("\nEjemplo:")
        print("  python update_status_simple.py a1b2c3d4-e5f6-7890-abcd-ef1234567890 2")
        sys.exit(1)
    
    if sys.argv[1] == "list":
        list_files()
    elif len(sys.argv) == 3:
        file_key = sys.argv[1]
        new_status = int(sys.argv[2])
        update_status(file_key, new_status)
    else:
        print("Argumentos inválidos")
        sys.exit(1)
