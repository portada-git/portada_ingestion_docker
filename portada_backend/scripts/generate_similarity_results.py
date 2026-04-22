"""
Script simplificado para generar resultados de similitud
Usa datos RAW y genera archivos JSON para el frontend
"""

import json
import os
from datetime import datetime
from pathlib import Path
from collections import Counter
from portada_data_layer import PortadaBuilder, BoatFactCleaning
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
# INICIALIZAR
# ═══════════════════════════════════════════════════════════════════════════

print("[1/3] Inicializando...")

with open(DATA_LAYER_CONFIG_PATH, encoding="utf-8") as f:
    config_layer = json.load(f)

builder = PortadaBuilder(config_layer)
layer = BoatFactCleaning(builder=builder)

# NO llamar start_session() para evitar problemas de permisos
# layer.start_session()

# Leer entradas RAW directamente
try:
    df_entries = layer.read_raw_entries()
    if df_entries is None:
        print("ERROR: No se pudieron leer entradas")
        exit(1)
    
    # Agregar columna temp_key
    from pyspark.sql.functions import lit
    df_entries = df_entries.withColumn("temp_key", lit("raw"))
    
    entry_count = df_entries.count()
    print(f"✓ {entry_count} entradas cargadas")
except Exception as e:
    print(f"ERROR leyendo entradas: {e}")
    exit(1)

# Cargar configuración de similitud
with open(SIMILARITY_CONFIG_PATH, encoding="utf-8") as f:
    similarity_config = json.load(f)

service = SimilarityService.from_dict(similarity_config)
print(f"✓ Servicio de similitud creado\n")

# ═══════════════════════════════════════════════════════════════════════════
# PROCESAR ENTIDADES
# ═══════════════════════════════════════════════════════════════════════════

print("[2/3] Procesando entidades...")

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
        # Obtener voces conocidas
        df_ke_raw = layer.read_raw_entities(entity_name)
        if df_ke_raw is None or df_ke_raw.count() == 0:
            entity_result["status"] = "no_data"
            print("Sin datos")
            all_results["entities"][entity_name] = entity_result
            continue
        
        df_known = layer.get_known_entity_voices(df_entities=df_ke_raw)
        known_count = df_known.count()
        entity_result["known_voices"] = known_count
        
        # Convertir a diccionario
        known_rows = df_known.collect()
        voices_dict = {}
        for row in known_rows:
            data = row.asDict(True)
            canonical = str(data.get("name", "")).strip()
            voice = str(data.get("voice", "")).strip()
            if canonical and voice:
                if canonical not in voices_dict:
                    voices_dict[canonical] = []
                if voice not in voices_dict[canonical]:
                    voices_dict[canonical].append(voice)
        
        # Extraer citaciones
        if entity_name == "port":
            df_citations = layer.extract_ports(df_entries, from_port_of_calls=False, from_arrival_port=False)
        elif entity_name == "ship_type":
            df_citations = layer.extract_ship_types(df_entries)
        elif entity_name == "flag":
            df_citations = layer.extract_ship_flags(df_entries)
        elif entity_name == "master_role":
            df_citations = layer.extract_master_roles(df_entries)
        else:
            raise ValueError(f"Método de extracción no definido para '{entity_name}'")
        
        if df_citations is None or df_citations.count() == 0:
            entity_result["status"] = "no_citations"
            print("Sin citaciones")
            all_results["entities"][entity_name] = entity_result
            continue
        
        # Convertir a lista con frecuencias
        citations_rows = df_citations.collect()
        citations_counter = Counter()
        for row in citations_rows:
            data = row.asDict(True)
            citation = data.get("citation")
            if citation:
                citation_str = str(citation).strip()
                if citation_str and citation_str.lower() != "null":
                    citations_counter[citation_str] += 1
        
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
        
        print(f"✓ {coverage:.1f}% cobertura")
        
    except Exception as e:
        entity_result["status"] = "error"
        entity_result["error"] = str(e)[:200]
        print(f"✗ ERROR")
    
    all_results["entities"][entity_name] = entity_result

# ═══════════════════════════════════════════════════════════════════════════
# GUARDAR RESULTADOS
# ═══════════════════════════════════════════════════════════════════════════

print("\n[3/3] Guardando resultados...")

# Guardar resultado completo
output_file = f"{OUTPUT_DIR}/similarity_results.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print(f"✓ Resultados guardados en: {output_file}")

print("\n" + "="*80)
print("PROCESO COMPLETADO")
print("="*80)
print(f"\nResultados en: {OUTPUT_DIR}/similarity_results.json")
print("="*80 + "\n")
