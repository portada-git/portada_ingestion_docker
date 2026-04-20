"""
Script completo para procesar análisis de similitud:
1. Limpiar entradas RAW (11 pasos)
2. Extraer todas las entidades conocidas
3. Aplicar algoritmos de similitud
4. Guardar resultados en archivos JSON para el frontend
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
SCHEMA_PATH = "/app/config/schema.json"
MAPPING_PATH = "/app/config/mapping_to_clean_chars.json"
OUTPUT_DIR = "/app/similarity_results"

# Crear directorio de salida
Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

# Entidades a procesar
ENTITIES = ["port", "ship_type", "flag", "ship_tons", "master_role", "comodity", "unit", "travel_duration"]

print("\n" + "="*80)
print("PROCESO COMPLETO DE ANÁLISIS DE SIMILITUD")
print("="*80)
print(f"Output: {OUTPUT_DIR}/")
print("="*80 + "\n")

# ═══════════════════════════════════════════════════════════════════════════
# PASO 1: INICIALIZAR CAPA DE DATOS
# ═══════════════════════════════════════════════════════════════════════════

print("[1/4] Inicializando capa de datos...")

with open(DATA_LAYER_CONFIG_PATH, encoding="utf-8") as f:
    config_layer = json.load(f)

builder = PortadaBuilder(config_layer)
layer = BoatFactCleaning(builder=builder)
layer.start_session()

# Cargar schema y mapping
with open(SCHEMA_PATH, encoding="utf-8") as f:
    schema = json.load(f)

with open(MAPPING_PATH, encoding="utf-8") as f:
    mapping = json.load(f)

layer.use_schema(schema).use_mapping_to_clean_chars(mapping)

print("✓ Capa de datos inicializada\n")

# ═══════════════════════════════════════════════════════════════════════════
# PASO 2: LIMPIAR ENTRADAS (11 PASOS)
# ═══════════════════════════════════════════════════════════════════════════

print("[2/4] Limpiando entradas (11 pasos)...")

# Leer entradas RAW
df_raw = layer.read_raw_entries()
if df_raw is None:
    print("ERROR: No se pudieron leer entradas RAW")
    exit(1)

raw_count = df_raw.count()
print(f"  → {raw_count} entradas RAW cargadas")

# Aplicar proceso de limpieza completo
print("  → Aplicando proceso de limpieza completo...")
df_clean = layer.cleaning(df_raw)

clean_count = df_clean.count()
print(f"✓ {clean_count} entradas limpias\n")

# ═══════════════════════════════════════════════════════════════════════════
# PASO 3: EXTRAER ENTIDADES Y APLICAR ALGORITMOS
# ═══════════════════════════════════════════════════════════════════════════

print("[3/4] Extrayendo entidades y aplicando algoritmos...")

# Cargar configuración de similitud
with open(SIMILARITY_CONFIG_PATH, encoding="utf-8") as f:
    similarity_config = json.load(f)

service = SimilarityService.from_dict(similarity_config)
print(f"✓ Servicio de similitud creado\n")

# Resultados globales
all_results = {
    "timestamp": datetime.now().isoformat(),
    "total_entries": clean_count,
    "entities": {}
}

# Procesar cada entidad
for entity_idx, entity_name in enumerate(ENTITIES, 1):
    print(f"[{entity_idx}/{len(ENTITIES)}] Procesando {entity_name}...")
    
    entity_result = {
        "name": entity_name,
        "status": "pending",
        "error": None,
        "known_voices": 0,
        "unique_terms": 0,
        "total_citations": 0,
        "coverage": 0.0,
        "classification": {},
        "top_matches": [],
        "gray_zone_cases": [],
        "rejected_cases": []
    }
    
    try:
        # 1. Obtener voces conocidas
        df_ke_raw = layer.read_raw_entities(entity_name)
        
        if df_ke_raw is None or df_ke_raw.count() == 0:
            entity_result["status"] = "no_data"
            entity_result["error"] = "No hay entidades conocidas en Delta Lake"
            print(f"  ⚠️  Sin datos\n")
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
        
        print(f"  → {known_count} voces conocidas")
        
        # 2. Extraer citaciones
        if entity_name == "port":
            df_citations = layer.extract_ports(df_clean, from_port_of_calls=False, from_arrival_port=False)
        elif entity_name == "ship_type":
            df_citations = layer.extract_ship_types(df_clean)
        elif entity_name == "flag":
            df_citations = layer.extract_ship_flags(df_clean)
        elif entity_name == "ship_tons":
            df_citations = layer.extract_ship_tons_units(df_clean)
        elif entity_name == "master_role":
            df_citations = layer.extract_master_roles(df_clean)
        elif entity_name == "comodity":
            df_raw_cargo = layer.extract_cargo_comodities_and_units(df_clean)
            df_citations = df_raw_cargo.filter("cargo_commodity_citation IS NOT NULL").selectExpr("cargo_commodity_citation as citation")
        elif entity_name == "unit":
            df_raw_cargo = layer.extract_cargo_comodities_and_units(df_clean)
            df_citations = df_raw_cargo.filter("cargo_unit_citation IS NOT NULL").selectExpr("cargo_unit_citation as citation")
        elif entity_name == "travel_duration":
            df_citations = layer.extract_travel_durations(df_clean)
        else:
            raise ValueError(f"Método de extracción no definido para '{entity_name}'")
        
        if df_citations is None or df_citations.count() == 0:
            entity_result["status"] = "no_citations"
            entity_result["error"] = "No se extrajeron citaciones"
            print(f"  ⚠️  Sin citaciones\n")
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
        
        print(f"  → {len(terms_input)} términos únicos, {sum(citations_counter.values())} citaciones")
        
        # 3. Aplicar algoritmos de similitud
        voice_list = VoiceList.from_dict(entity_type=entity_name, data=voices_dict)
        results_list = service.evaluate(terms_input, voice_list)
        
        # 4. Analizar resultados
        classification_counts = Counter(r.get("classification") for r in results_list)
        entity_result["classification"] = dict(classification_counts)
        
        resolved = sum(1 for r in results_list if r.get("classification") in ["EXACT", "CONSENSUS"])
        resolved_freq = sum(r.get("frequency", 0) for r in results_list if r.get("classification") in ["EXACT", "CONSENSUS"])
        total_freq = sum(r.get("frequency", 0) for r in results_list)
        
        coverage = (resolved_freq / total_freq * 100) if total_freq > 0 else 0
        entity_result["coverage"] = round(coverage, 2)
        entity_result["status"] = "success"
        
        # 5. Extraer casos interesantes para el frontend
        # Top 10 matches con mayor frecuencia
        top_matches = sorted(
            [r for r in results_list if r.get("classification") in ["EXACT", "CONSENSUS"]],
            key=lambda x: x.get("frequency", 0),
            reverse=True
        )[:10]
        entity_result["top_matches"] = top_matches
        
        # Casos en zona gris (para revisión manual)
        gray_zone = [r for r in results_list if r.get("classification") == "GRAY_ZONE"][:20]
        entity_result["gray_zone_cases"] = gray_zone
        
        # Casos rechazados con alta frecuencia (posibles entidades faltantes)
        rejected = sorted(
            [r for r in results_list if r.get("classification") == "REJECTED"],
            key=lambda x: x.get("frequency", 0),
            reverse=True
        )[:20]
        entity_result["rejected_cases"] = rejected
        
        print(f"  ✓ Cobertura: {coverage:.1f}%\n")
        
    except Exception as e:
        entity_result["status"] = "error"
        entity_result["error"] = str(e)[:200]
        print(f"  ✗ ERROR: {str(e)[:100]}\n")
    
    all_results["entities"][entity_name] = entity_result

# ═══════════════════════════════════════════════════════════════════════════
# PASO 4: GUARDAR RESULTADOS
# ═══════════════════════════════════════════════════════════════════════════

print("[4/4] Guardando resultados...")

# Guardar resultado completo
output_file = f"{OUTPUT_DIR}/similarity_analysis_results.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print(f"✓ Resultados guardados en: {output_file}")

# Guardar resumen para el frontend
summary = {
    "timestamp": all_results["timestamp"],
    "total_entries": all_results["total_entries"],
    "entities_summary": []
}

for entity_name, entity_data in all_results["entities"].items():
    summary["entities_summary"].append({
        "name": entity_name,
        "status": entity_data["status"],
        "known_voices": entity_data["known_voices"],
        "unique_terms": entity_data["unique_terms"],
        "coverage": entity_data["coverage"],
        "classification": entity_data["classification"]
    })

summary_file = f"{OUTPUT_DIR}/summary.json"
with open(summary_file, "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print(f"✓ Resumen guardado en: {summary_file}")

# Guardar archivo por entidad (para carga más rápida en frontend)
for entity_name, entity_data in all_results["entities"].items():
    entity_file = f"{OUTPUT_DIR}/entity_{entity_name}.json"
    with open(entity_file, "w", encoding="utf-8") as f:
        json.dump(entity_data, f, ensure_ascii=False, indent=2)
    print(f"✓ {entity_name} → {entity_file}")

print("\n" + "="*80)
print("PROCESO COMPLETADO")
print("="*80)
print(f"\nArchivos generados en: {OUTPUT_DIR}/")
print("  - similarity_analysis_results.json (completo)")
print("  - summary.json (resumen)")
print("  - entity_*.json (por entidad)")
print("\nPara copiar al host:")
print(f"  docker cp portada_ingestion_docker-api-1:{OUTPUT_DIR} ./similarity_results")
print("="*80 + "\n")
