"""
Script simplificado para generar resultados de similitud
Lee directamente de JSON sin usar Delta Lake
"""

import json
import os
from datetime import datetime
from pathlib import Path
from collections import Counter
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, explode, lit
from portada_s_index import SimilarityService, VoiceList

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════

SIMILARITY_CONFIG_PATH = "/app/config/config_similarity.json"
OUTPUT_DIR = "/tmp/similarity_results"
KNOWN_ENTITIES_BASE = "/app/delta_test/docker/portada_project/known_entities"
RAW_ENTRIES_PATH = "/app/delta_test/docker/portada_project/raw_entries"

# Crear directorio de salida
Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

# Entidades a procesar
ENTITIES = ["port", "ship_type", "flag", "master_role"]

# Mapeo de nombres de entidades a archivos
ENTITY_FILES = {
    "port": "travel_arrival_port",
    "ship_type": "ship_type",
    "flag": "ship_flag",
    "master_role": "master_role"
}

# Mapeo de campos en las entradas RAW
ENTITY_FIELDS = {
    "port": ["travel_arrival_port", "travel_departure_port"],
    "ship_type": ["ship_type"],
    "flag": ["ship_flag"],
    "master_role": ["master_role"]
}

print("\n" + "="*80)
print("GENERACIÓN DE RESULTADOS DE SIMILITUD (VERSIÓN SIMPLE)")
print("="*80)
print(f"Output: {OUTPUT_DIR}/")
print("="*80 + "\n")

# ═══════════════════════════════════════════════════════════════════════════
# INICIALIZAR SPARK
# ═══════════════════════════════════════════════════════════════════════════

print("[1/4] Inicializando Spark...")

spark = SparkSession.builder \
    .appName("SimilarityAnalysis") \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .getOrCreate()

spark.sparkContext.setLogLevel("WARN")
print("✓ Spark inicializado\n")

# ═══════════════════════════════════════════════════════════════════════════
# CARGAR CONFIGURACIÓN DE SIMILITUD
# ═══════════════════════════════════════════════════════════════════════════

print("[2/4] Cargando configuración...")

with open(SIMILARITY_CONFIG_PATH, encoding="utf-8") as f:
    similarity_config = json.load(f)

service = SimilarityService.from_dict(similarity_config)
print(f"✓ Servicio de similitud creado\n")

# ═══════════════════════════════════════════════════════════════════════════
# LEER ENTRADAS RAW
# ═══════════════════════════════════════════════════════════════════════════

print("[3/4] Leyendo entradas RAW...")

# Leer todos los archivos JSON de entradas
df_entries = spark.read.json(f"{RAW_ENTRIES_PATH}/*/*.json")
entry_count = df_entries.count()
print(f"✓ {entry_count} entradas cargadas\n")

# ═══════════════════════════════════════════════════════════════════════════
# PROCESAR ENTIDADES
# ═══════════════════════════════════════════════════════════════════════════

print("[4/4] Procesando entidades...")

all_results = {
    "timestamp": datetime.now().isoformat(),
    "total_entries": entry_count,
    "entities": {}
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
        # Leer entidades conocidas desde JSON
        entity_file = ENTITY_FILES.get(entity_name)
        known_path = f"{KNOWN_ENTITIES_BASE}/{entity_file}.json"
        
        if not Path(known_path).exists():
            entity_result["status"] = "no_known_entities_file"
            print(f"✗ Archivo no encontrado: {known_path}")
            all_results["entities"][entity_name] = entity_result
            continue
        
        # Leer entidades conocidas
        with open(known_path, 'r', encoding='utf-8') as f:
            known_data = json.load(f)
        
        # Construir diccionario de voces
        voices_dict = {}
        for item in known_data:
            canonical = item.get("name", "").strip()
            voices = item.get("voices", [])
            if canonical and voices:
                voices_dict[canonical] = [v.strip() for v in voices if v.strip()]
        
        entity_result["known_voices"] = len(voices_dict)
        
        if len(voices_dict) == 0:
            entity_result["status"] = "no_known_voices"
            print("Sin voces conocidas")
            all_results["entities"][entity_name] = entity_result
            continue
        
        # Extraer citaciones de las entradas RAW
        citations_counter = Counter()
        fields = ENTITY_FIELDS.get(entity_name, [])
        
        for field in fields:
            if field in df_entries.columns:
                citations = df_entries.select(field).filter(col(field).isNotNull()).collect()
                for row in citations:
                    citation = str(row[field]).strip()
                    if citation and citation.lower() != "null":
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
