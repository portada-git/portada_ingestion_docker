"""
Script para generar resultados de similitud con TODAS las entidades disponibles
cargo_list ya es ARRAY, usa cargo_commodity y cargo_unit
"""

import json
from datetime import datetime
from pathlib import Path
from collections import Counter
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, explode
from portada_s_index import SimilarityService, VoiceList

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════

DATA_LAYER_CONFIG_PATH = "/app/config/delta_data_layer_config.json"
SIMILARITY_CONFIG_PATH = "/app/config/config_similarity.json"
OUTPUT_DIR = "/app/similarity_results"  # Directorio donde el backend lee los resultados

Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

# Entidades disponibles (solo las que existen en los datos)
ENTITIES = [
    "port",           # travel_arrival_port, travel_departure_port
    "ship_type",      # ship_type
    "flag",           # ship_flag
    "ship_tons",      # ship_tons
    "travel_duration",# travel_duration
    "master_role",    # master_role
    "comodity",       # cargo_list -> cargo -> cargo_commodity
    "unit",           # cargo_list -> cargo -> cargo_unit
]

print("\n" + "="*80)
print("GENERACIÓN DE RESULTADOS DE SIMILITUD")
print("="*80)
print(f"Output: {OUTPUT_DIR}/")
print(f"Entidades: {len(ENTITIES)}")
print("="*80 + "\n")

# ═══════════════════════════════════════════════════════════════════════════
# INICIALIZAR SPARK
# ═══════════════════════════════════════════════════════════════════════════

print("[1/4] Inicializando Spark...")

with open(DATA_LAYER_CONFIG_PATH, encoding="utf-8") as f:
    config_layer = json.load(f)

spark = SparkSession.builder \
    .appName("SimilarityAnalysis") \
    .master("local[*]") \
    .config("spark.jars.packages", "io.delta:delta-spark_2.12:3.2.1") \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .getOrCreate()

spark.sparkContext.setLogLevel("WARN")

# Rutas
base_path = config_layer.get("base_path", "/app/delta_test/docker")
project_name = config_layer.get("project_data_name", "portada_project")

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
    print("ERROR: No se encontró el directorio de entradas")
    exit(1)

print(f"✓ Usando ruta: {entries_path}")

# Leer entradas
try:
    df = spark.read.format("delta").load(entries_path)
    entry_count = df.count()
    print(f"✓ {entry_count} entradas cargadas\n")
except Exception as e:
    print(f"ERROR leyendo entradas: {e}")
    exit(1)

# ═══════════════════════════════════════════════════════════════════════════
# CARGAR CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════

print("[2/4] Cargando configuración...")

with open(SIMILARITY_CONFIG_PATH, encoding="utf-8") as f:
    similarity_config = json.load(f)

service = SimilarityService.from_dict(similarity_config)
print("✓ Servicio de similitud creado")

known_entities_file = "/app/known_entities.json"
with open(known_entities_file, 'r', encoding='utf-8') as f:
    all_known_entities = json.load(f)

print("✓ Entidades conocidas cargadas\n")

# ═══════════════════════════════════════════════════════════════════════════
# PROCESAR ENTIDADES
# ═══════════════════════════════════════════════════════════════════════════

print("[3/4] Procesando entidades...")

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
        # Obtener entidades conocidas
        known_data = all_known_entities.get(entity_name, {})
        
        if not known_data or not isinstance(known_data, dict):
            entity_result["status"] = "no_known_entities"
            print("Sin entidades conocidas")
            all_results["entities"][entity_name] = entity_result
            continue
        
        # Construir diccionario de voces
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
        
        # Extraer citaciones según la entidad
        citations_counter = Counter()
        
        if entity_name == "port":
            for field in ["travel_arrival_port", "travel_departure_port"]:
                if field in df.columns:
                    citations = df.select(field).filter(col(field).isNotNull()).collect()
                    for row in citations:
                        citation = str(row[field]).strip()
                        if citation and citation.lower() not in ["null", "none", ""]:
                            citations_counter[citation] += 1
        
        elif entity_name == "ship_type":
            if "ship_type" in df.columns:
                citations = df.select("ship_type").filter(col("ship_type").isNotNull()).collect()
                for row in citations:
                    citation = str(row["ship_type"]).strip()
                    if citation and citation.lower() not in ["null", "none", ""]:
                        citations_counter[citation] += 1
        
        elif entity_name == "flag":
            if "ship_flag" in df.columns:
                citations = df.select("ship_flag").filter(col("ship_flag").isNotNull()).collect()
                for row in citations:
                    citation = str(row["ship_flag"]).strip()
                    if citation and citation.lower() not in ["null", "none", ""]:
                        citations_counter[citation] += 1

        elif entity_name == "ship_tons":
            tons_field = None
            if "ship_tons_unit" in df.columns:
                tons_field = "ship_tons_unit"
            elif "ship_tons_unit_detailed_value" in df.columns:
                tons_field = "ship_tons_unit_detailed_value"
            elif "ship_tons_capacity" in df.columns:
                tons_field = "ship_tons_capacity"
            elif "ship_tons_capacity_detailed_value" in df.columns:
                tons_field = "ship_tons_capacity_detailed_value"

            if tons_field:
                citations = df.select(tons_field).filter(col(tons_field).isNotNull()).collect()
                for row in citations:
                    citation = str(row[tons_field]).strip()
                    if citation and citation.lower() not in ["null", "none", "", "n/a"]:
                        citations_counter[citation] += 1

        elif entity_name == "travel_duration":
            duration_field = None
            if "travel_duration_unit" in df.columns:
                duration_field = "travel_duration_unit"
            elif "travel_duration_unit_detailed_value" in df.columns:
                duration_field = "travel_duration_unit_detailed_value"
            elif "travel_duration_value" in df.columns:
                duration_field = "travel_duration_value"
            elif "travel_duration_value_detailed_value" in df.columns:
                duration_field = "travel_duration_value_detailed_value"

            if duration_field:
                citations = df.select(duration_field).filter(col(duration_field).isNotNull()).collect()
                for row in citations:
                    citation = str(row[duration_field]).strip()
                    if citation and citation.lower() not in ["null", "none", "", "n/a"]:
                        citations_counter[citation] += 1
        
        elif entity_name == "master_role":
            if "master_role" in df.columns:
                citations = df.select("master_role").filter(col("master_role").isNotNull()).collect()
                for row in citations:
                    citation = str(row["master_role"]).strip()
                    if citation and citation.lower() not in ["null", "none", ""]:
                        citations_counter[citation] += 1
        
        elif entity_name == "comodity":
            # cargo_list ya es ARRAY, explotar directamente
            if "cargo_list" in df.columns:
                # Explotar cargo_list -> cargo (array interno)
                df_exploded = df.select(explode("cargo_list").alias("cargo_item"))
                df_cargo = df_exploded.select(explode("cargo_item.cargo").alias("cargo"))
                
                # Extraer cargo_commodity
                citations = df_cargo.select("cargo.cargo_commodity").filter(col("cargo.cargo_commodity").isNotNull()).collect()
                for row in citations:
                    citation = str(row["cargo_commodity"]).strip()
                    if citation and citation.lower() not in ["null", "none", "", "n/a"]:
                        citations_counter[citation] += 1
        
        elif entity_name == "unit":
            # cargo_list ya es ARRAY, explotar directamente
            if "cargo_list" in df.columns:
                # Explotar cargo_list -> cargo (array interno)
                df_exploded = df.select(explode("cargo_list").alias("cargo_item"))
                df_cargo = df_exploded.select(explode("cargo_item.cargo").alias("cargo"))
                
                # Extraer cargo_unit
                citations = df_cargo.select("cargo.cargo_unit").filter(col("cargo.cargo_unit").isNotNull()).collect()
                for row in citations:
                    citation = str(row["cargo_unit"]).strip()
                    if citation and citation.lower() not in ["null", "none", "", "n/a"]:
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

print("\n[4/4] Guardando resultados...")

output_file = f"{OUTPUT_DIR}/similarity_results.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print(f"✓ Resultados guardados en: {output_file}")

spark.stop()

print("\n" + "="*80)
print("PROCESO COMPLETADO")
print("="*80)
print(f"\nResultados en: {output_file}")
print(f"Entidades procesadas: {len([e for e in all_results['entities'].values() if e['status'] == 'success'])}/{len(ENTITIES)}")
print("="*80 + "\n")
