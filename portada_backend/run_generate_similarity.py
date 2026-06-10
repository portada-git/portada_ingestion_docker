#!/usr/bin/env python3
"""
Script multiplataforma para generar resultados de similitud
Compatible con Windows y Linux
"""

import subprocess
import sys
import os
from pathlib import Path

PORTADA_S_INDEX_VERSION = "0.2.0"

def run_command(cmd, description):
    """Ejecuta un comando y muestra el resultado"""
    print(f"\n{description}...")
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        if result.stdout:
            print(result.stdout)
        print(f"[OK] {description} completado")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] {description} falló")
        if e.stderr:
            print(e.stderr)
        return False

def main():
    print("=" * 80)
    print("GENERACION DE RESULTADOS DE SIMILITUD")
    print("=" * 80)
    print("\nEste script:")
    print("1. Copia archivos de configuracion al contenedor")
    print("2. Ejecuta el script de generacion de resultados")
    print("3. Copia los resultados al host")
    print("\nADVERTENCIA: Este proceso puede tardar 10-15 minutos")
    print("=" * 80)
    
    container_name = "portada_ingestion_docker-api-1"
    
    # Verificar que el contenedor existe
    print("\nVerificando contenedor...")
    result = subprocess.run(
        ["docker", "ps", "-a", "--filter", f"name={container_name}", "--format", "{{.Names}}"],
        capture_output=True,
        text=True,
    )
    
    if container_name not in result.stdout:
        print(f"[ERROR] Contenedor '{container_name}' no encontrado")
        print("Verifica que el contenedor esté corriendo con: docker ps")
        sys.exit(1)
    
    print(f"[OK] Contenedor '{container_name}' encontrado")

    # Actualizar librería publicada dentro del contenedor.
    # Se ejecuta como root porque la imagen define USER spark y site-packages no es escribible.
    print("\n" + "=" * 80)
    print("ACTUALIZANDO PORTADA-S-INDEX EN EL CONTENEDOR")
    print("=" * 80)

    install_cmd = [
        "docker",
        "exec",
        "-u",
        "root",
        container_name,
        "python",
        "-m",
        "pip",
        "install",
        "--no-cache-dir",
        "--upgrade",
        "--no-deps",
        f"portada-s-index=={PORTADA_S_INDEX_VERSION}",
    ]
    if not run_command(install_cmd, f"Instalando portada-s-index=={PORTADA_S_INDEX_VERSION}"):
        print("[ERROR] No se pudo actualizar portada-s-index en el contenedor")
        sys.exit(1)

    prepare_delta_test_cmd = [
        "docker",
        "exec",
        "-u",
        "root",
        container_name,
        "sh",
        "-lc",
        "mkdir -p /app/delta_test/docker/portada_project/data_versions && "
        "chown -R spark:spark /app/delta_test",
    ]
    if not run_command(prepare_delta_test_cmd, "Preparando permisos de /app/delta_test"):
        print("[ERROR] No se pudo preparar /app/delta_test para py-portada-data-layer")
        sys.exit(1)
    
    # Rutas de archivos de configuración (relativas al directorio raíz del proyecto)
    project_root = Path(__file__).parent.parent
    config_files = [
        (project_root / ".examples/portada-s-index/config_jsons_delcorreo/schema.json", "/app/config/schema.json"),
        (project_root / ".examples/portada-s-index/config_jsons_delcorreo/mapping_to_clean_chars.json", "/app/config/mapping_to_clean_chars.json"),
        (project_root / "data_layer_config/delta_data_layer_config.json", "/app/config/delta_data_layer_config.json"),
        (project_root / "data_layer_config/config_similarity.json", "/app/config/config_similarity.json"),
    ]
    
    # Copiar archivos de configuración
    print("\n" + "=" * 80)
    print("COPIANDO ARCHIVOS DE CONFIGURACION")
    print("=" * 80)
    
    for src, dst in config_files:
        if not src.exists():
            print(f"[WARNING] Archivo no encontrado: {src}")
            continue
        
        cmd = ["docker", "cp", str(src), f"{container_name}:{dst}"]
        if not run_command(cmd, f"Copiando {src.name}"):
            print(f"[ERROR] No se pudo copiar {src}")
            sys.exit(1)
    
    # Copiar script de generación basado en py-portada-data-layer
    print("\n" + "=" * 80)
    print("COPIANDO SCRIPT DE GENERACION CON DATALAYER")
    print("=" * 80)
    
    script_src = project_root / "portada_backend/scripts/generate_similarity_with_datalayer.py"
    script_dst = "/app/generate_similarity_with_datalayer.py"
    
    if not script_src.exists():
        print(f"[ERROR] Script no encontrado: {script_src}")
        sys.exit(1)
    
    cmd = ["docker", "cp", str(script_src), f"{container_name}:{script_dst}"]
    if not run_command(cmd, "Copiando script"):
        print("[ERROR] No se pudo copiar el script")
        sys.exit(1)
    
    # Ejecutar script en el contenedor
    print("\n" + "=" * 80)
    print("EJECUTANDO PROCESO DE GENERACION")
    print("=" * 80)
    print("\nEsto puede tardar 10-15 minutos...\n")
    
    cmd = ["docker", "exec", container_name, "python", script_dst]
    result = subprocess.run(cmd)
    
    if result.returncode != 0:
        print("\n[ERROR] El proceso de generación falló")
        sys.exit(1)
    
    # Crear carpeta de resultados si no existe
    results_dir = project_root / "portada_backend/similarity_results"
    results_dir.mkdir(parents=True, exist_ok=True)
    
    # Copiar resultados del contenedor al host
    print("\n" + "=" * 80)
    print("COPIANDO RESULTADOS AL HOST")
    print("=" * 80)
    
    src_file = "/tmp/similarity_results/similarity_results_datalayer.json"
    dst_file = results_dir / "similarity_results.json"
    
    cmd = ["docker", "cp", f"{container_name}:{src_file}", str(dst_file)]
    if run_command(cmd, "Copiando resultados"):
        print(f"\n[OK] Resultados guardados en: {dst_file}")
    else:
        print("\n[ERROR] No se pudieron copiar los resultados")
        print("Verifica que el proceso de generación haya completado exitosamente")
        sys.exit(1)
    
    # Resumen final
    print("\n" + "=" * 80)
    print("PROCESO COMPLETADO EXITOSAMENTE")
    print("=" * 80)
    print(f"\nResultados disponibles en: {dst_file}")
    print("\nPuedes visualizarlos en: http://localhost:5173/similarity-results")
    print("=" * 80 + "\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n[CANCELADO] Proceso interrumpido por el usuario")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Error inesperado: {e}")
        sys.exit(1)
