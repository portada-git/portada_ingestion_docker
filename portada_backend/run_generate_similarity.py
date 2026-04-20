#!/usr/bin/env python3
"""
Script multiplataforma para generar resultados de similitud
Compatible con Windows y Linux
"""

import subprocess
import sys
import os
from pathlib import Path

def run_command(cmd, description):
    """Ejecuta un comando y muestra el resultado"""
    print(f"\n{description}...")
    try:
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
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
        f"docker ps -a --filter name={container_name} --format '{{{{.Names}}}}'",
        shell=True,
        capture_output=True,
        text=True
    )
    
    if container_name not in result.stdout:
        print(f"[ERROR] Contenedor '{container_name}' no encontrado")
        print("Verifica que el contenedor esté corriendo con: docker ps")
        sys.exit(1)
    
    print(f"[OK] Contenedor '{container_name}' encontrado")
    
    # Rutas de archivos de configuración (relativas al directorio raíz del proyecto)
    project_root = Path(__file__).parent.parent
    config_files = [
        (project_root / ".examples/portada-s-index/config_jsons_delcorreo/schema.json", "/app/config/schema.json"),
        (project_root / ".examples/portada-s-index/config_jsons_delcorreo/mapping_to_clean_chars.json", "/app/config/mapping_to_clean_chars.json"),
        (project_root / ".examples/portada-s-index/config_jsons_delcorreo/delta_data_layer_config.json", "/app/config/delta_data_layer_config.json"),
        (project_root / ".examples/portada-s-index/test_posrtada_s_index/config.json", "/app/config/config_similarity.json"),
    ]
    
    # Copiar archivos de configuración
    print("\n" + "=" * 80)
    print("COPIANDO ARCHIVOS DE CONFIGURACION")
    print("=" * 80)
    
    for src, dst in config_files:
        if not src.exists():
            print(f"[WARNING] Archivo no encontrado: {src}")
            continue
        
        cmd = f"docker cp {str(src)} {container_name}:{dst}"
        if not run_command(cmd, f"Copiando {src.name}"):
            print(f"[ERROR] No se pudo copiar {src}")
            sys.exit(1)
    
    # Copiar script de generación
    print("\n" + "=" * 80)
    print("COPIANDO SCRIPT DE GENERACION")
    print("=" * 80)
    
    script_src = project_root / "portada_backend/scripts/generate_similarity_results.py"
    script_dst = "/app/generate_similarity_results.py"
    
    if not script_src.exists():
        print(f"[ERROR] Script no encontrado: {script_src}")
        sys.exit(1)
    
    cmd = f"docker cp {str(script_src)} {container_name}:{script_dst}"
    if not run_command(cmd, "Copiando script"):
        print("[ERROR] No se pudo copiar el script")
        sys.exit(1)
    
    # Ejecutar script en el contenedor
    print("\n" + "=" * 80)
    print("EJECUTANDO PROCESO DE GENERACION")
    print("=" * 80)
    print("\nEsto puede tardar 10-15 minutos...\n")
    
    cmd = f"docker exec -it {container_name} python {script_dst}"
    result = subprocess.run(cmd, shell=True)
    
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
    
    src_file = "/tmp/similarity_results/similarity_results.json"
    dst_file = results_dir / "similarity_results.json"
    
    cmd = f"docker cp {container_name}:{src_file} {str(dst_file)}"
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
