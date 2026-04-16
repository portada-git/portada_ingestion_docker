"""
Test correcto usando portada_data_layer
Basado en test_delta_lake.py
"""

import json
from collections import Counter
from portada_data_layer import PortadaBuilder, BoatFactCleaning
from portada_s_index import SimilarityService

print("\n" + "="*80)
print("TEST: COMPARACIÓN DE ENTIDADES (USO CORRECTO DE PORTADA_DATA_LAYER)")
print("="*80 + "\n")

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN E INICIALIZACIÓN
# ═══════════════════════════════════════════════════════════════════════════

DATA_LAYER_CONFIG_PATH = "/app/config/delta_data_layer_config.json"
SIMILARITY_CONFIG_PATH = "/app/config/config_similarity.json"
OUTPUT_DIR = "/tmp/test_results_datalayer"

print("Inicializando...")
with open(DATA_LAYER_CONFIG_PATH, encoding="utf-8") as f:
    config_layer = json.load(f)

builder = PortadaBuilder(config_layer)
layer = BoatFactCleaning(builder=builder)
layer.start_session()

service = SimilarityService.from_file(SIMILARITY_CONFIG_PATH)
print("✓ Inicialización completada\n")

# ═══════════════════════════════════════════════════════════════════════════
# LEER ENTRADAS
# ═══════════════════════════════════════════════════════════════════════════

#Invertir el orden de busqueda
print("Leyendo entradas de barcos...")
df_entries = layer.read_raw_entries()

if df_entries is None or df_entries.count() == 0:
    print("No hay raw entries, intentando read_ship_entries...")
    df_entries = layer.read_ship_entries()

if df_entries is None:
    print("❌ ERROR: No se pudieron leer entradas")
    exit(1)

entry_count = df_entries.count()
print(f"✓ {entry_count} entradas cargadas")

# IMPORTANTE: Agregar columna temp_key que esperan los métodos de extracción
print("Agregando columna temp_key...")
from pyspark.sql.functions import lit
df_entries = df_entries.withColumn("temp_key", lit("raw"))
print("✓ Columna temp_key agregada\n")

# ═══════════════════════════════════════════════════════════════════════════
# PROCESAR ENTIDADES
# ═══════════════════════════════════════════════════════════════════════════

results_summary = []

# Lista de entidades a procesar
ENTITIES = ["port", "ship_type", "flag", "ship_tons", "master_role", "comodity", "unit","travel_duration"]

for entity_name in ENTITIES:
    print("="*80)
    print(f"PROCESANDO: {entity_name.upper()}")
    print("="*80 + "\n")
    
    # ───────────────────────────────────────────────────────────────────────
    # A) ENTIDADES CONOCIDAS
    # ───────────────────────────────────────────────────────────────────────
    
    print(f"A) Entidades conocidas:")
    print(f"   1. df_raw = layer.read_raw_entities('{entity_name}')")
    
    try:
        df_ke_raw = layer.read_raw_entities(entity_name)
        
        if df_ke_raw is None or df_ke_raw.count() == 0:
            print(f"   ⚠️  No hay datos raw para '{entity_name}'")
            print()
            continue
        
        raw_count = df_ke_raw.count()
        print(f"      → {raw_count} registros raw")
        
        print(f"   2. df_known = layer.get_known_entity_voices(df_entities=df_raw)")
        df_known = layer.get_known_entity_voices(df_entities=df_ke_raw)
        
        if df_known is None:
            print(f"   ⚠️  No se pudieron obtener voces para '{entity_name}'")
            print()
            continue
        
        known_count = df_known.count()
        print(f"      → {known_count} voces conocidas")
        
        # Mostrar ejemplos
        print(f"   → Primeros 3 registros:")
        df_known.show(3, truncate=False)
        
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
        print()
        continue
    
    # ───────────────────────────────────────────────────────────────────────
    # B) CITACIONES EXTRAÍDAS
    # ───────────────────────────────────────────────────────────────────────
    
    print(f"\nB) Citaciones extraídas:")
    
    try:
        if entity_name == "port":
            print(f"   df_citations = layer.extract_ports(df_entries, from_port_of_calls=False, from_arrival_port=False)")
            df_citations = layer.extract_ports(df_entries, from_port_of_calls=False, from_arrival_port=False)
        
        elif entity_name == "ship_type":
            print(f"   df_citations = layer.extract_ship_types(df_entries)")
            df_citations = layer.extract_ship_types(df_entries)
        
        elif entity_name == "flag":
            print(f"   df_citations = layer.extract_ship_flags(df_entries)")
            df_citations = layer.extract_ship_flags(df_entries)
        
        elif entity_name == "ship_tons":
            print(f"   df_citations = layer.extract_ship_tons_units(df_entries)")
            df_citations = layer.extract_ship_tons_units(df_entries)
        
        elif entity_name == "master_role":
            print(f"   df_citations = layer.extract_master_roles(df_entries)")
            df_citations = layer.extract_master_roles(df_entries)
        
        elif entity_name == "comodity":
            print(f"   df_citations = layer.extract_cargo_comodities_and_units(df_entries)")
            df_raw = layer.extract_cargo_comodities_and_units(df_entries)
            df_citations = df_raw.filter("cargo_commodity_citation IS NOT NULL").selectExpr("cargo_commodity_citation as citation")
        
        elif entity_name == "unit":
            print(f"   df_citations = layer.extract_cargo_comodities_and_units(df_entries)")
            df_raw = layer.extract_cargo_comodities_and_units(df_entries)
            df_citations = df_raw.filter("cargo_unit_citation IS NOT NULL").selectExpr("cargo_unit_citation as citation")
        
        else:
            print(f"   ⚠️  Método de extracción no definido para '{entity_name}'")
            print()
            continue
        
        if df_citations is None:
            print(f"   ⚠️  No se pudieron extraer citaciones")
            print()
            continue
        
        citations_count = df_citations.count()
        print(f"      → {citations_count} citaciones extraídas")
        
        # Mostrar ejemplos
        print(f"   → Primeros 3 registros:")
        df_citations.show(3, truncate=False)
        
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        print()
        continue
    
    # ───────────────────────────────────────────────────────────────────────
    # C) EJECUTAR SIMILITUD
    # ───────────────────────────────────────────────────────────────────────
    
    print(f"\nC) Ejecutando similitud:")
    print(f"   results = service.evaluate(df_citations, df_known)")
    
    try:
        # Convertir DataFrames a formato esperado por portada-s-index
        # El servicio espera listas de Python, no DataFrames de Spark
        
        # Convertir voces conocidas a diccionario
        print(f"   → Convirtiendo voces conocidas a diccionario...")
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
        
        print(f"      {len(voices_dict)} entidades canónicas")
        
        # Convertir citaciones a lista con frecuencias
        print(f"   → Convirtiendo citaciones a lista...")
        #mirar como hacer el distinc con sparck
        citations_rows = df_citations.collect()
        from collections import Counter
        citations_counter = Counter()
        for row in citations_rows:
            data = row.asDict(True)
            citation = data.get("citation")
            if citation:
                citation_str = str(citation).strip()
                if citation_str:
                    citations_counter[citation_str] += 1
        
        terms_input = [{"term": t, "frequency": f} for t, f in citations_counter.items()]
        print(f"      {len(terms_input)} términos únicos, {sum(citations_counter.values())} totales")
        
        # Ejecutar similitud
        print(f"   → Ejecutando algoritmo...")
        from portada_s_index import VoiceList
        voice_list = VoiceList.from_dict(entity_type=entity_name, data=voices_dict)
        results_list = service.evaluate(terms_input, voice_list)
        
        print(f"      → {len(results_list)} resultados")
        
        # Analizar clasificación
        classification_counts = Counter(r.get("classification") for r in results_list)
        print(f"   → Distribución:")
        for classification, count in classification_counts.most_common():
            print(f"      • {classification}: {count}")
        
        # Guardar resultados
        output_file = f"{OUTPUT_DIR}/{entity_name}_results.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(results_list, f, ensure_ascii=False, indent=2)
        print(f"   → Guardado en: {output_file}")
        
        # Calcular cobertura
        resolved = sum(1 for r in results_list if r.get("classification") in ["EXACT", "CONSENSUS"])
        resolved_freq = sum(r.get("frequency", 0) for r in results_list if r.get("classification") in ["EXACT", "CONSENSUS"])
        total_freq = sum(r.get("frequency", 0) for r in results_list)
        
        coverage = (resolved_freq / total_freq * 100) if total_freq > 0 else 0
        print(f"   → Cobertura: {coverage:.1f}% de citaciones resueltas")
        
        results_summary.append({
            "entity": entity_name,
            "known_count": known_count,
            "citations_count": citations_count,
            "unique_terms": len(terms_input),
            "total_citations": sum(citations_counter.values()),
            "results_count": len(results_list),
            "coverage": round(coverage, 2),
            "classification": dict(classification_counts)
        })
        
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    print()

# ═══════════════════════════════════════════════════════════════════════════
# RESUMEN FINAL
# ═══════════════════════════════════════════════════════════════════════════

print("="*80)
print("RESUMEN FINAL")
print("="*80 + "\n")

if results_summary:
    for result in results_summary:
        print(f"{result['entity'].upper():<15}")
        print(f"  Conocidas: {result['known_count']:>5} voces")
        print(f"  Extraídas: {result['unique_terms']:>5} únicas, {result['total_citations']:>6} totales")
        print(f"  Resultados: {result['results_count']:>5}")
        print(f"  Cobertura: {result['coverage']:>6.2f}%")
        print(f"  Clasificación: {result['classification']}")
        print()
    
    # Guardar resumen consolidado
    consolidated_file = f"{OUTPUT_DIR}/consolidated_summary.json"
    with open(consolidated_file, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": "2026-04-14T04:00:00",
            "total_entries": entry_count,
            "entities": results_summary
        }, f, ensure_ascii=False, indent=2)
    
    print(f"✅ Resumen guardado en: {consolidated_file}")
else:
    print("⚠️  No se procesó ninguna entidad")

print("\nPara copiar resultados:")
print("  docker cp portada_ingestion_docker-api-1:/tmp/test_results_datalayer ./test_results_final")
print("="*80 + "\n")
