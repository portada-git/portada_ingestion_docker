"""
Test comparativo de TODOS los algoritmos de portada-s-index
Ejecuta cada algoritmo individualmente sobre las 8 entidades
"""

import json
import os
from collections import Counter
from datetime import datetime
from pathlib import Path
from portada_data_layer import PortadaBuilder, BoatFactCleaning
from portada_s_index import SimilarityService, VoiceList

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════

DATA_LAYER_CONFIG_PATH = "/app/config/delta_data_layer_config.json"
OUTPUT_BASE = "/tmp/test_all_algorithms"
Path(OUTPUT_BASE).mkdir(parents=True, exist_ok=True)

# Todos los algoritmos disponibles en portada-s-index
ALGORITHMS = {
    "levenshtein_ocr": {
        "threshold": 0.75,
        "gray_zone": [0.65, 0.75],
        "params": {"confusion_cost": 0.4}
    },
    "levenshtein_ratio": {
        "threshold": 0.75,
        "gray_zone": [0.65, 0.75],
        "params": {}
    },
    "jaro_winkler": {
        "threshold": 0.88,
        "gray_zone": [0.78, 0.88],
        "params": {}
    },
    "ngram_2": {
        "threshold": 0.5,
        "gray_zone": [0.4, 0.5],
        "params": {}
    },
    "ngram_3": {
        "threshold": 0.5,
        "gray_zone": [0.4, 0.5],
        "params": {}
    },
    "ngram_4": {
        "threshold": 0.45,
        "gray_zone": [0.35, 0.45],
        "params": {}
    },
    "phonetic_dm": {
        "threshold": 0.5,
        "gray_zone": [0.3, 0.5],
        "params": {}
    },
    "soundex": {
        "threshold": 0.5,
        "gray_zone": [0.3, 0.5],
        "params": {}
    },
    "semantica": {
        "threshold": 0.5,
        "gray_zone": [0.35, 0.5],
        "params": {}
    },
    "text2vec": {
        "threshold": 0.6,
        "gray_zone": [0.5, 0.6],
        "params": {"n": 3}
    },
    "semantic_model": {
        "threshold": 0.8,
        "gray_zone": [0.7, 0.8],
        "params": {
            "backend": "auto",
            "model": "shibing624/text2vec-base-multilingual",
            "device": "cpu"
        }
    },
    "fasttext": {
        "threshold": 0.8,
        "gray_zone": [0.7, 0.8],
        "params": {"model_path": "models/fasttext/cc.es.300.bin"}
    },
    "byt5": {
        "threshold": 0.8,
        "gray_zone": [0.7, 0.8],
        "params": {"model": "agusnieto77/byt5-portada-contrastivo", "device": "cpu"}
    }
}

# Entidades a procesar
ENTITIES = ["port", "ship_type", "flag", "ship_tons", "master_role", "comodity", "unit", "travel_duration"]

print("\n" + "="*80)
print("TEST COMPARATIVO: TODOS LOS ALGORITMOS DE SIMILITUD")
print("="*80)
print(f"Algoritmos a probar: {len(ALGORITHMS)}")
print(f"Entidades a procesar: {len(ENTITIES)}")
print(f"Output: {OUTPUT_BASE}/")
print("="*80 + "\n")

# ═══════════════════════════════════════════════════════════════════════════
# FUNCIONES
# ═══════════════════════════════════════════════════════════════════════════

def create_config_for_algorithm(algorithm_name: str) -> dict:
    """Crea una configuración con solo un algoritmo habilitado"""
    config = {
        "version": 2,
        "normalize": True,
        "consensus": {
            "min_votes": 1,  # Solo 1 voto porque solo hay 1 algoritmo
            "require_levenshtein_ocr": False
        },
        "algorithms": {}
    }
    
    # Habilitar solo el algoritmo especificado
    for alg_name, alg_config in ALGORITHMS.items():
        config["algorithms"][alg_name] = {
            "enabled": (alg_name == algorithm_name),
            "threshold": alg_config["threshold"],
            "gray_zone": alg_config["gray_zone"],
            "params": alg_config["params"]
        }
    
    return config


def process_entity(layer, df_entries, entity_name: str):
    """Procesa una entidad y devuelve voces conocidas y citaciones"""
    
    log_file = Path(OUTPUT_BASE) / f"entity_{entity_name}_log.txt"
    
    def log(msg):
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
        print(f"    {msg}")
    
    log(f"=== Procesando entidad: {entity_name} ===")
    
    # 1. Obtener voces conocidas
    try:
        log("1. Obteniendo voces conocidas...")
        df_ke_raw = layer.read_raw_entities(entity_name)
        
        if df_ke_raw is None:
            log("   ERROR: read_raw_entities devolvió None")
            return None, None, None, "No raw entities found"
        
        raw_count = df_ke_raw.count()
        if raw_count == 0:
            log(f"   ERROR: 0 registros raw")
            return None, None, None, "No raw entities (count=0)"
        
        log(f"   ✓ {raw_count} registros raw")
        
        df_known = layer.get_known_entity_voices(df_entities=df_ke_raw)
        if df_known is None:
            log("   ERROR: get_known_entity_voices devolvió None")
            return None, None, None, "Could not get voices"
        
        known_count = df_known.count()
        log(f"   ✓ {known_count} voces conocidas")
        
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
        
        log(f"   ✓ {len(voices_dict)} entidades canónicas en diccionario")
        
    except Exception as e:
        error_msg = f"ERROR obteniendo voces: {str(e)}"
        log(f"   {error_msg}")
        return None, None, None, error_msg
    
    # 2. Extraer citaciones
    try:
        log("2. Extrayendo citaciones...")
        
        if entity_name == "port":
            df_citations = layer.extract_ports(df_entries, from_port_of_calls=False, from_arrival_port=False)
        elif entity_name == "ship_type":
            df_citations = layer.extract_ship_types(df_entries)
        elif entity_name == "flag":
            df_citations = layer.extract_ship_flags(df_entries)
        elif entity_name == "ship_tons":
            df_citations = layer.extract_ship_tons_units(df_entries)
        elif entity_name == "master_role":
            df_citations = layer.extract_master_roles(df_entries)
        elif entity_name == "comodity":
            log("   Intentando extract_cargo_comodities_and_units...")
            try:
                df_raw = layer.extract_cargo_comodities_and_units(df_entries)
                df_citations = df_raw.filter("cargo_commodity_citation IS NOT NULL").selectExpr("cargo_commodity_citation as citation")
            except Exception as e:
                error_msg = f"ERROR: cargo_list es STRING en RAW entries, necesita ser ARRAY. Detalle: {str(e)[:200]}"
                log(f"   {error_msg}")
                return voices_dict, None, known_count, error_msg
        elif entity_name == "unit":
            log("   Intentando extract_cargo_comodities_and_units...")
            try:
                df_raw = layer.extract_cargo_comodities_and_units(df_entries)
                df_citations = df_raw.filter("cargo_unit_citation IS NOT NULL").selectExpr("cargo_unit_citation as citation")
            except Exception as e:
                error_msg = f"ERROR: cargo_list es STRING en RAW entries, necesita ser ARRAY. Detalle: {str(e)[:200]}"
                log(f"   {error_msg}")
                return voices_dict, None, known_count, error_msg
        elif entity_name == "travel_duration":
            log("   Intentando extract_travel_durations...")
            try:
                df_citations = layer.extract_travel_durations(df_entries)
            except Exception as e:
                error_msg = f"ERROR extrayendo travel_duration: {str(e)[:200]}"
                log(f"   {error_msg}")
                return voices_dict, None, known_count, error_msg
        else:
            error_msg = f"Método de extracción no definido para '{entity_name}'"
            log(f"   {error_msg}")
            return None, None, None, error_msg
        
        if df_citations is None:
            error_msg = "Método de extracción devolvió None"
            log(f"   ERROR: {error_msg}")
            return voices_dict, None, known_count, error_msg
        
        citations_count = df_citations.count()
        if citations_count == 0:
            error_msg = "0 citaciones extraídas"
            log(f"   ERROR: {error_msg}")
            return voices_dict, None, known_count, error_msg
        
        log(f"   ✓ {citations_count} citaciones extraídas")
        
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
        log(f"   ✓ {len(terms_input)} términos únicos, {sum(citations_counter.values())} totales")
        
        return voices_dict, terms_input, known_count, None
        
    except Exception as e:
        error_msg = f"ERROR extrayendo citaciones: {str(e)[:200]}"
        log(f"   {error_msg}")
        import traceback
        log(f"   Traceback: {traceback.format_exc()[:500]}")
        return voices_dict, None, known_count, error_msg


# ═══════════════════════════════════════════════════════════════════════════
# INICIALIZACIÓN
# ═══════════════════════════════════════════════════════════════════════════

print("Inicializando capa de datos...")
with open(DATA_LAYER_CONFIG_PATH, encoding="utf-8") as f:
    config_layer = json.load(f)

builder = PortadaBuilder(config_layer)
layer = BoatFactCleaning(builder=builder)
layer.start_session()

print("Leyendo entradas...")
df_entries = layer.read_raw_entries()
if df_entries is None:
    print("ERROR: No se pudieron leer entradas")
    exit(1)

# Agregar columna temp_key
from pyspark.sql.functions import lit
df_entries = df_entries.withColumn("temp_key", lit("raw"))

entry_count = df_entries.count()
print(f"✓ {entry_count} entradas cargadas\n")

# ═══════════════════════════════════════════════════════════════════════════
# PROCESAR CADA ALGORITMO
# ═══════════════════════════════════════════════════════════════════════════

all_results = {}

for alg_idx, algorithm_name in enumerate(ALGORITHMS.keys(), 1):
    print("="*80)
    print(f"ALGORITMO {alg_idx}/{len(ALGORITHMS)}: {algorithm_name.upper()}")
    print("="*80 + "\n")
    
    # Crear configuración para este algoritmo
    config = create_config_for_algorithm(algorithm_name)
    
    try:
        service = SimilarityService.from_dict(config)
        print(f"✓ Servicio creado\n")
    except Exception as e:
        print(f"❌ ERROR creando servicio: {e}\n")
        all_results[algorithm_name] = {"error": str(e), "entities": {}}
        continue
    
    algorithm_results = {}
    
    # Procesar cada entidad
    for entity_name in ENTITIES:
        print(f"  → {entity_name}...", end=" ", flush=True)
        
        # Obtener datos de la entidad (cachear para no repetir)
        cache_key = f"entity_data_{entity_name}"
        if cache_key not in globals():
            voices_dict, terms_input, known_count, error = process_entity(layer, df_entries, entity_name)
            globals()[cache_key] = (voices_dict, terms_input, known_count, error)
        else:
            voices_dict, terms_input, known_count, error = globals()[cache_key]
        
        if error:
            print(f"ERROR: {error[:50]}...")
            algorithm_results[entity_name] = {"error": error}
            continue
        
        if voices_dict is None or terms_input is None:
            print("Sin datos")
            algorithm_results[entity_name] = {"error": "No data available"}
            continue
        
        try:
            # Ejecutar similitud
            voice_list = VoiceList.from_dict(entity_type=entity_name, data=voices_dict)
            results_list = service.evaluate(terms_input, voice_list)
            
            # Analizar resultados
            classification_counts = Counter(r.get("classification") for r in results_list)
            
            resolved = sum(1 for r in results_list if r.get("classification") in ["EXACT", "CONSENSUS"])
            resolved_freq = sum(r.get("frequency", 0) for r in results_list if r.get("classification") in ["EXACT", "CONSENSUS"])
            total_freq = sum(r.get("frequency", 0) for r in results_list)
            
            coverage = (resolved_freq / total_freq * 100) if total_freq > 0 else 0
            
            algorithm_results[entity_name] = {
                "known_count": known_count,
                "unique_terms": len(terms_input),
                "total_citations": total_freq,
                "results_count": len(results_list),
                "coverage": round(coverage, 2),
                "classification": dict(classification_counts)
            }
            
            print(f"Cobertura: {coverage:.1f}%")
            
        except Exception as e:
            print(f"ERROR: {e}")
            algorithm_results[entity_name] = {"error": str(e)}
    
    all_results[algorithm_name] = algorithm_results
    print()

# ═══════════════════════════════════════════════════════════════════════════
# GENERAR REPORTE COMPARATIVO
# ═══════════════════════════════════════════════════════════════════════════

print("="*80)
print("REPORTE COMPARATIVO")
print("="*80 + "\n")

# Primero, mostrar estado de las entidades
print("ESTADO DE LAS ENTIDADES:")
print("-" * 80)
for entity in ENTITIES:
    cache_key = f"entity_data_{entity}"
    if cache_key in globals():
        voices_dict, terms_input, known_count, error = globals()[cache_key]
        if error:
            print(f"  {entity:<20} ❌ ERROR: {error[:50]}")
        elif voices_dict and terms_input:
            print(f"  {entity:<20} ✓ {known_count} voces, {len(terms_input)} términos únicos")
        else:
            print(f"  {entity:<20} ⚠️  Sin datos")
    else:
        print(f"  {entity:<20} ⚠️  No procesada")

print("\n" + "="*80)
print("COBERTURA (%) POR ALGORITMO Y ENTIDAD:")
print("-" * 80)

# Header
header = f"{'Algoritmo':<20}"
for entity in ENTITIES:
    header += f"{entity[:10]:>12}"
print(header)
print("-" * 80)

# Filas
for algorithm_name, entities_data in all_results.items():
    if "error" in entities_data:
        continue
    
    row = f"{algorithm_name:<20}"
    for entity in ENTITIES:
        if entity in entities_data and "coverage" in entities_data[entity]:
            coverage = entities_data[entity]["coverage"]
            row += f"{coverage:>11.1f}%"
        else:
            row += f"{'—':>12}"
    print(row)

print()

# Guardar resultados completos
output_file = f"{OUTPUT_BASE}/comparative_results.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump({
        "timestamp": datetime.now().isoformat(),
        "total_entries": entry_count,
        "algorithms": all_results
    }, f, ensure_ascii=False, indent=2)

print(f"✅ Resultados guardados en: {output_file}")
print(f"\nPara copiar resultados:")
print(f"  docker cp portada_ingestion_docker-api-1:/tmp/test_all_algorithms ./test_all_algorithms_results")
print("="*80 + "\n")
