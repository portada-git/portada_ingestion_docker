"""
Servicio de similitud que extrae datos directamente de JSONs
sin usar la capa de datos (que se cuelga con patches).
"""

import os
from pathlib import Path
from typing import Dict, List

from portada_s_index import SimilarityService as RealSimilarityService, VoiceList


INGEST_PATH = os.getenv("DELTA_LAKE_PATH", "/app/delta_lake") + "/portada_project/ingest"
KNOWN_ENTITIES_PATH = INGEST_PATH + "/known_entities"
SHIP_ENTRIES_PATH = INGEST_PATH + "/ship_entries"

# Mapeo de entidades a campos JSON y archivos de voces
ENTITY_CONFIG = {
    "port": {
        "citation_fields": ["travel_departure_port", "travel_arrival_port"],
        "voices_entity": "port",
    },
    "ship_type": {
        "citation_fields": ["ship_type"],
        "voices_entity": "ship_type",
    },
    "flag": {
        "citation_fields": ["ship_flag"],
        "voices_entity": "flag",
    },
    "ship_tons": {
        "citation_fields": ["ship_tons"],
        "voices_entity": "ship_tons",
    },
    "master_role": {
        "citation_fields": ["master_role"],
        "voices_entity": "master_role",
    },
    "comodity": {
        "citation_fields": ["cargo_commodity"],
        "voices_entity": "comodity",
    },
    "unit": {
        "citation_fields": ["cargo_unit"],
        "voices_entity": "unit",
    },
}


def extract_citations_from_json(json_path: Path, fields: List[str]) -> List[str]:
    """Extrae valores de campos específicos de un archivo JSON o JSONL."""
    citations = []
    
    try:
        with open(json_path, encoding="utf-8") as f:
            content = f.read().strip()
            
        # Intentar como JSON normal primero
        try:
            data = json.loads(content)
            entries = data if isinstance(data, list) else [data]
        except json.JSONDecodeError:
            # Si falla, intentar como JSONL (una línea por objeto)
            entries = []
            for line in content.split('\n'):
                line = line.strip()
                if line:
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
                        
    except Exception:
        return []

    for entry in entries:
        if not isinstance(entry, dict):
            continue
            
        for field in fields:
            value = entry.get(field)
            if value and isinstance(value, str):
                citations.append(value.strip())
            elif value and isinstance(value, list):
                citations.extend(str(v).strip() for v in value if v)

    return citations


def extract_entity_citations(entity: str) -> List[Dict[str, any]]:
    """Extrae todas las citaciones de una entidad desde los JSONs."""
    config = ENTITY_CONFIG.get(entity)
    if not config:
        raise ValueError(f"Entidad no soportada: {entity}")

    fields = config["citation_fields"]
    entries_path = Path(SHIP_ENTRIES_PATH)
    
    if not entries_path.exists():
        raise ValueError(f"Path de entradas no existe: {entries_path}")

    all_citations = []
    
    # Recorrer todos los archivos JSON
    for json_file in entries_path.rglob("*.json"):
        citations = extract_citations_from_json(json_file, fields)
        all_citations.extend(citations)

    # Contar frecuencias y convertir a formato para portada-s-index
    counter = Counter(all_citations)
    return [{"term": term, "frequency": freq} for term, freq in counter.items()]


def load_known_voices(entity: str) -> Dict[str, List[str]]:
    """Carga las voces conocidas desde archivos parquet."""
    config = ENTITY_CONFIG.get(entity)
    if not config:
        raise ValueError(f"Entidad no soportada: {entity}")

    voices_entity = config["voices_entity"]
    voices_path = Path(KNOWN_ENTITIES_PATH) / voices_entity
    
    if not voices_path.exists():
        raise ValueError(f"Path de voces no existe: {voices_path}")

    # Leer parquets con pandas (más simple que Spark)
    try:
        import pandas as pd
        
        voices_dict: Dict[str, List[str]] = {}
        
        for parquet_file in voices_path.glob("*.parquet"):
            df = pd.read_parquet(parquet_file)
            
            # Agrupar por 'name' (canónico) y colectar 'voice' (variantes)
            for _, row in df.iterrows():
                canonical = str(row.get("name", "")).strip()
                voice = str(row.get("voice", "")).strip()
                
                if canonical and voice:
                    if canonical not in voices_dict:
                        voices_dict[canonical] = []
                    if voice not in voices_dict[canonical]:
                        voices_dict[canonical].append(voice)
        
        return voices_dict
        
    except ImportError:
        raise ValueError("pandas no está instalado")


def run_similarity_direct(
    entity: str,
    config: Dict,
) -> Dict:
    """
    Ejecuta similitud extrayendo datos directamente de JSONs.
    """
    # 1. Extraer citaciones
    terms = extract_entity_citations(entity)
    
    if not terms:
        raise ValueError(f"No se encontraron citaciones para '{entity}'")

    # 2. Cargar voces conocidas
    voices_dict = load_known_voices(entity)
    
    if not voices_dict:
        raise ValueError(f"No se encontraron voces conocidas para '{entity}'")

    # 3. Crear VoiceList
    voice_list = VoiceList.from_dict(entity_type=entity, data=voices_dict)

    # 4. Ejecutar similitud con portada-s-index
    service = RealSimilarityService.from_dict(config)
    results = service.evaluate(terms, voice_list)

    # 5. Calcular estadísticas
    total_terms = len(terms)
    total_occurrences = sum(t["frequency"] for t in terms)
    
    available_algorithms = service.active_algorithms
    allowed_algorithms = service.config.allowed_names_for_entity(entity)

    return {
        "input": {
            "entity": entity,
            "use_clean_entries": False,  # Siempre usa raw con este método
        },
        "config": config,
        "summary": {
            "terms_count": total_terms,
            "total_occurrences": total_occurrences,
            "voices_count": len(voice_list.all_voices()),
            "available_algorithms": available_algorithms,
            "allowed_algorithms": allowed_algorithms,
        },
        "results": results,
    }
