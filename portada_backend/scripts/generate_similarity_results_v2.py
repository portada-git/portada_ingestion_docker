"""
Script para generar resultados de similitud
Lee entradas RAW usando Delta Lake directamente
"""

import json
import os
from datetime import datetime
from pathlib import Path
from collections import Counter
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, lit
from portada_s_index import SimilarityService, VoiceList

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════

DATA_LAYER_CONFIG_PATH = "/app/config/delta_data_layer_config.json"
SIMILARITY_CONFIG_PATH = "/app/config/config_similarity.json"
OUTPUT_DIR = "/tmp/similarity_results"

# Crear directorio de salida
Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

# Entidades a procesar
ENTITIES = ["port", "ship_type", "flag", "master_role"]

print("\n" + "="*80)
print("GENERACIÓN DE RESULTADOS DE SIMILITUD")
print("="*80)
print(f"Output: {OUTPUT_DIR}/")
print("="*80 + "\n")

# ═══════════════════════════════════════════════════════════════════════════
# INICIALIZAR SPARK
# ═══════════════════════════════════════════════════════════════════════════

print("[1/4] Inicializando Spark...")

# Leer configuración
with open(DATA_LAYER_CONFIG_PATH, encoding="utf-8") as f:
    config_layer = json.load(f)

# Crear sesión de Spark
spark = SparkSession.builder \
    .appName("SimilarityAnalysis") \
    .master("local[*]") \
    .config("spark.jars.packages", "io.delta:delta-spark_2.12:3.2.1") \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .getOrCreate()

spark.sparkContext.setLogLevel("WARN")

# Rutas desde la configuración
base_path = config_layer.get("base_path", "/app/delta_test/docker")
project_name = config_layer.get("project_data_name", "portada_project")

# Intentar diferentes rutas posibles
possible_paths = [
    f"{base_path}/{project_name}/bronze/original_data/ship_entries",
    f"/app/delta_lake/{project_name}/bronze/original_data/ship_entries",
]

entries_path = None
for path in possible_paths:
    if Path(path).exists():
        entries_path = path
        break

if not entries_path:
    print(f"ERROR: No se encontró el directorio de entradas en ninguna de estas rutas:")
    for p in possible_paths:
        print(f"  - {p}")
    exit(1)

print(f"✓ Usando ruta: {entries_path}")

# Leer entradas RAW desde Delta
try:
    df_entries = spark.read.format("delta").load(entries_path)
    entry_count = df_entries.count()
    print(f"✓ {entry_count} entradas cargadas\n")
except Exception as e:
    print(f"ERROR leyendo entradas: {e}")
    exit(1)

# ═══════════════════════════════════════════════════════════════════════════
# CARGAR CONFIGURACIÓN DE SIMILITUD
# ═══════════════════════════════════════════════════════════════════════════

print("[2/4] Cargando configuración de similitud...")

with open(SIMILARITY_CONFIG_PATH, encoding="utf-8") as f:
    similarity_config = json.load(f)

service = SimilarityService.from_dict(similarity_config)
print(f"✓ Servicio de similitud creado\n")

# ═══════════════════════════════════════════════════════════════════════════
# CARGAR ENTIDADES CONOCIDAS
# ═══════════════════════════════════════════════════════════════════════════

print("[3/4] Cargando entidades conocidas...")

# Buscar archivo de entidades conocidas
known_entities_paths = [
    "/app/known_entities.json",
    f"{base_path}/{project_name}/known_entities.json",
    f"/app/delta_lake/{project_name}/known_entities.json",
]

known_entities_file = None
for path in known_entities_paths:
    if Path(path).exists():
        known_entities_file = path
        break

if not known_entities_file:
    print("ERROR: No se encontró el archivo de entidades conocidas")
    exit(1)

print(f"✓ Usando: {known_entities_file}")

with open(known_entities_file, 'r', encoding='utf-8') as f:
    all_known_entities = json.load(f)

print(f"✓ Entidades conocidas cargadas\n")

# ═══════════════════════════════════════════════════════════════════════════
# PROCESAR ENTIDADES
# ═══════════════════════════════════════════════════════════════════════════

print("[4/4] Procesando entidades...")

all_results = {
    "timestamp": datetime.now().isoformat(),
    "total_entries": entry_count,
    "entities": {}
}

# Mapeo de entidades a campos en las entradas
ENTITY_FIELD_MAP = {
    "port": ["travel_arrival_port", "travel_departure_port"],
    "ship_type": ["ship_type"],
    "flag": ["ship_flag"],
    "master_role": ["master_role"]
}

for entity_idx, entity_name in enumerate(ENTITIES, 1):
    print(f"  [{entity_idx}/{len(ENTITIES)}] {entity_name}...", end=" ", flush=True)
    
    entity_result = {
        "name": entity_name,
        "status": "pending",
        "known_voices": 0,
        "unique_terms": 0,
        "total_citations": 0,
        "coverage": 0.0,
        "results": []
    }
    
    try:
        # Obtener entidades conocidas para esta entidad
        known_data = all_known_entities.get(entity_name, {})
        
        if not known_data or not isinstance(known_data, dict):
            entity_result["status"] = "no_known_entities"
            print("Sin entidades conocidas")
            all_results["entities"][entity_name] = entity_result
            continue
        
        # El formato es: {"CANONICAL": ["voice1", "voice2"]}
        voices_dict = {}
        for canonical, voices in known_data.items():
            canonical_clean = canonical.strip()
            if canonical_clean and isinstance(voices, list) and voices:
                voices_dict[canonical_clean] = [v.strip() for v in voices if v and v.strip()]
        
        entity_result["known_voices"] = len(voices_dict)
        
        if len(voices_dict) == 0:
            entity_result["status"] = "no_voices"
            print("Sin voces")
            all_results["entities"][entity_name] = entity_result
            continue
        
        # Extraer citaciones de las entradas
        citations_counter = Counter()
        fields = ENTITY_FIELD_MAP.get(entity_name, [])
        
        for field in fields:
            if field in df_entries.columns:
                citations = df_entries.select(field).filter(col(field).isNotNull()).collect()
                for row in citations:
                    citation = str(row[field]).strip()
                    if citation and citation.lower() not in ["null", "none", ""]:
                        citations_counter[citation] += 1
        
        if len(citations_counter) == 0:
            entity_result["status"] = "no_citations"
            print("Sin citaciones")
            all_results["entities"][entity_name] = entity_result
            continue
        
        terms_input = [{"term": t, "frequency": f} for t, f in citations_counter.items()]
        entity_result["unique_terms"] = len(terms_input)
        entity_result["total_citations"] = sum(citations_counter.values())
        
        # Aplicar algoritmos de similitud
        voice_list = VoiceList.from_dict(entity_type=entity_name, data=voices_dict)
        results_list = service.evaluate(terms_input, voice_list)
        
        # Calcular cobertura
        resolved_freq = sum(r.get("frequency", 0) for r in results_list if r.get("classification") in ["EXACT", "CONSENSUS"])
        total_freq = sum(r.get("frequency", 0) for r in results_list)
        coverage = (resolved_freq / total_freq * 100) if total_freq > 0 else 0
        
        entity_result["coverage"] = round(coverage, 2)
        entity_result["status"] = "success"
        entity_result["results"] = results_list
        
        print(f"✓ {coverage:.1f}% cobertura ({len(results_list)} resultados)")
        
    except Exception as e:
        entity_result["status"] = "error"
        entity_result["error"] = str(e)[:200]
        print(f"✗ ERROR: {str(e)[:100]}")
    
    all_results["entities"][entity_name] = entity_result

# ═══════════════════════════════════════════════════════════════════════════
# GUARDAR RESULTADOS
# ═══════════════════════════════════════════════════════════════════════════

print("\nGuardando resultados...")

output_file = f"{OUTPUT_DIR}/similarity_results.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print(f"✓ Resultados guardados en: {output_file}")

# Detener Spark
spark.stop()

print("\n" + "="*80)
print("PROCESO COMPLETADO")
print("="*80)
print(f"\nResultados en: {output_file}")
print("="*80 + "\n")
