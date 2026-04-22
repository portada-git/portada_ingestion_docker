"""
Script para ejecutar la desambiguación completa de entidades usando portada-s-index.

Extrae citaciones del Delta Lake, las compara contra voces conocidas usando
algoritmos de similitud, y guarda los resultados en JSON.

Uso (dentro del contenedor api):
  python run_disambiguation.py
  python run_disambiguation.py --entity port --output /app/output/port_results.json
  python run_disambiguation.py --all --output-dir /app/output/disambiguation
"""

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Dict, List

from portada_data_layer import PortadaBuilder
from portada_data_layer.portada_cleaning import BoatFactCleaning
from portada_s_index import SimilarityService, VoiceList


# Mapeo de entidades a sus métodos de extracción
ENTITY_EXTRACTORS = {
    "port": {
        "known_entity": "port",
        "extract_method": "extract_ports",
        "citation_column": "citation",
    },
    "ship_type": {
        "known_entity": "ship_type",
        "extract_method": "extract_ship_types",
        "citation_column": "citation",
    },
    "flag": {
        "known_entity": "flag",
        "extract_method": "extract_ship_flags",
        "citation_column": "citation",
    },
    "ship_tons": {
        "known_entity": "ship_tons",
        "extract_method": "extract_ship_tons_units",
        "citation_column": "citation",
    },
    "master_role": {
        "known_entity": "master_role",
        "extract_method": "extract_master_roles",
        "citation_column": "citation",
    },
    "comodity": {
        "known_entity": "comodity",
        "extract_method": "extract_cargo_comodities_and_units",
        "citation_column": "cargo_commodity_citation",
    },
    "unit": {
        "known_entity": "unit",
        "extract_method": "extract_cargo_comodities_and_units",
        "citation_column": "cargo_unit_citation",
    },
}

DATA_LAYER_CONFIG_PATH = os.getenv(
    "CONFIG_PATH", "/app/config/delta_data_layer_config.json"
)
SIMILARITY_CONFIG_PATH = os.getenv(
    "SIMILARITY_CONFIG_PATH", "/app/config/config_similarity.json"
)
DEFAULT_OUTPUT_DIR = "/app/output/disambiguation"


def build_layer() -> BoatFactCleaning:
    """Construye la capa de datos del Delta Lake."""
    with open(DATA_LAYER_CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)

    builder = PortadaBuilder(config)
    layer = builder.build(BoatFactCleaning.__name__)
    
    # Iniciar sesión sin aplicar patches (solo lectura)
    try:
        layer.start_session()
    except Exception as e:
        print(f"  [WARN] Error al iniciar sesión con patches: {e}")
        print(f"  [INFO] Intentando sin patches...")
        # Forzar inicio sin patches
        layer._spark_session = layer._builder._spark_session
    
    return layer


def load_similarity_service() -> SimilarityService:
    """Carga el servicio de similitud con su configuración."""
    with open(SIMILARITY_CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)
    return SimilarityService.from_dict(config)


def collect_voices_dict(layer: BoatFactCleaning, known_entity: str) -> Dict[str, List[str]]:
    """
    Extrae voces conocidas y las agrupa por entidad canónica.
    Formato: {"CANONICAL_NAME": ["voice1", "voice2", ...], ...}
    """
    try:
        df = layer.get_known_entity_voices(known_entity=known_entity)
        rows = df.collect()
    except Exception as e:
        print(f"  [ERROR] No se pudieron obtener voces para '{known_entity}': {e}")
        return {}

    result: Dict[str, List[str]] = {}
    for row in rows:
        data = row.asDict(True)
        voice = str(data.get("voice", "")).strip()
        canonical = str(data.get("name", "")).strip()
        if voice and canonical:
            result.setdefault(canonical, [])
            if voice not in result[canonical]:
                result[canonical].append(voice)

    return result


def extract_citations(
    layer: BoatFactCleaning, entity: str, use_clean: bool = True
) -> List[Dict[str, any]]:
    """
    Extrae citaciones de las entradas de barcos.
    Retorna: [{"term": "barcelona", "frequency": 5}, ...]
    """
    spec = ENTITY_EXTRACTORS[entity]
    
    # Obtener entradas
    if use_clean:
        df_entries = layer.read_ship_entries()
    else:
        df_entries = layer.read_raw_entries()

    if df_entries is None:
        raise ValueError("No se pudieron obtener entradas del Delta Lake")

    # Extraer citaciones usando el método correspondiente
    extract_method = getattr(layer, spec["extract_method"])
    df_citations = extract_method(df_entries)

    if df_citations is None:
        raise ValueError(f"No se pudieron extraer citaciones para '{entity}'")

    # Recolectar y contar términos
    citation_col = spec["citation_column"]
    rows = df_citations.select(citation_col).collect()
    
    counter = Counter()
    for row in rows:
        value = row.asDict(True).get(citation_col)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            counter[text] += 1

    # Convertir a formato esperado por portada-s-index
    return [{"term": term, "frequency": freq} for term, freq in counter.items()]


def run_disambiguation(
    entity: str,
    layer: BoatFactCleaning,
    service: SimilarityService,
    use_clean: bool = True,
) -> Dict:
    """
    Ejecuta la desambiguación completa para una entidad.
    """
    print(f"\n{'='*60}")
    print(f"Procesando: {entity.upper()}")
    print(f"{'='*60}")

    spec = ENTITY_EXTRACTORS[entity]
    known_entity = spec["known_entity"]

    # 1. Obtener voces conocidas
    print(f"  [1/3] Obteniendo voces conocidas...")
    voices_dict = collect_voices_dict(layer, known_entity)
    if not voices_dict:
        print(f"  [ERROR] No hay voces conocidas para '{entity}'")
        return {"entity": entity, "error": "No voices found"}

    total_voices = sum(len(v) for v in voices_dict.values())
    print(f"        → {len(voices_dict)} entidades canónicas, {total_voices} voces")

    # 2. Extraer citaciones
    print(f"  [2/3] Extrayendo citaciones de entradas...")
    try:
        terms = extract_citations(layer, entity, use_clean)
    except Exception as e:
        print(f"  [ERROR] {e}")
        return {"entity": entity, "error": str(e)}

    if not terms:
        print(f"  [ERROR] No se encontraron citaciones")
        return {"entity": entity, "error": "No citations found"}

    print(f"        → {len(terms)} términos únicos extraídos")

    # 3. Ejecutar algoritmos de similitud
    print(f"  [3/3] Ejecutando algoritmos de similitud...")
    voice_list = VoiceList.from_dict(entity_type=entity, data=voices_dict)
    results = service.evaluate(terms, voice_list)

    print(f"        → {len(results)} resultados generados")

    # Calcular distribución de clasificaciones
    classification_dist = Counter(r.get("classification") for r in results)
    
    print(f"\n  Distribución de clasificaciones:")
    for classification, count in classification_dist.most_common():
        print(f"    - {classification}: {count}")

    return {
        "entity": entity,
        "known_entity": known_entity,
        "use_clean_entries": use_clean,
        "stats": {
            "canonical_entities": len(voices_dict),
            "total_voices": total_voices,
            "unique_terms": len(terms),
            "total_citations": sum(t["frequency"] for t in terms),
            "classification_distribution": dict(classification_dist),
        },
        "results": results,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Ejecuta desambiguación de entidades usando portada-s-index"
    )
    parser.add_argument(
        "--entity",
        choices=list(ENTITY_EXTRACTORS.keys()),
        help="Entidad específica a procesar",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Procesar todas las entidades",
    )
    parser.add_argument(
        "--output",
        help="Ruta del archivo JSON de salida (solo con --entity)",
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directorio de salida para --all (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Usar entradas raw en lugar de limpias",
    )
    args = parser.parse_args()

    if not args.entity and not args.all:
        parser.error("Debes especificar --entity o --all")

    print(f"Config Delta Lake: {DATA_LAYER_CONFIG_PATH}")
    print(f"Config Similitud: {SIMILARITY_CONFIG_PATH}")
    print()

    # Inicializar servicios
    print("Iniciando sesión Spark...")
    try:
        layer = build_layer()
    except Exception as e:
        print(f"[ERROR] No se pudo iniciar la capa de datos: {e}")
        sys.exit(1)

    print("Cargando servicio de similitud...")
    try:
        service = load_similarity_service()
    except Exception as e:
        print(f"[ERROR] No se pudo cargar el servicio de similitud: {e}")
        sys.exit(1)

    use_clean = not args.raw

    # Procesar entidades
    if args.entity:
        # Procesar una sola entidad
        result = run_disambiguation(args.entity, layer, service, use_clean)
        
        output_path = Path(args.output) if args.output else Path(DEFAULT_OUTPUT_DIR) / f"{args.entity}_results.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        
        print(f"\n✓ Guardado en: {output_path}")

    else:
        # Procesar todas las entidades
        output_dir = Path(args.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        all_results = {}
        for entity in ENTITY_EXTRACTORS.keys():
            result = run_disambiguation(entity, layer, service, use_clean)
            all_results[entity] = result

            # Guardar resultado individual
            entity_file = output_dir / f"{entity}_results.json"
            with open(entity_file, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

        # Guardar resumen consolidado
        summary_file = output_dir / "summary.json"
        summary = {
            "total_entities": len(all_results),
            "use_clean_entries": use_clean,
            "entities": {
                entity: result.get("stats", {})
                for entity, result in all_results.items()
            },
        }
        with open(summary_file, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

        print(f"\n✓ Todos los resultados guardados en: {output_dir}")
        print(f"✓ Resumen en: {summary_file}")


if __name__ == "__main__":
    main()
