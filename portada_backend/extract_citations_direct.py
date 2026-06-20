"""
Script para extraer citaciones directamente de los archivos JSON
sin usar la capa de datos (que se cuelga con patches).

Uso:
  python extract_citations_direct.py --entity port
  python extract_citations_direct.py --all
"""

import argparse
import json
import os
from collections import Counter
from pathlib import Path
from typing import Dict, List


INGEST_PATH = "/app/delta_lake/portada_project/ingest/ship_entries"
OUTPUT_DIR = "/app/output/citations"

# Mapeo de entidades a campos JSON
ENTITY_FIELDS = {
    "port": ["travel_departure_port", "travel_arrival_port"],
    "ship_type": ["ship_type"],
    "flag": ["ship_flag"],
    "ship_tons": ["ship_tons"],
    "master_role": ["master_role"],
    "comodity": ["cargo_commodity"],
    "unit": ["cargo_unit"],
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
                        
    except Exception as e:
        print(f"  [WARN] Error leyendo {json_path.name}: {e}")
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


def extract_entity_citations(entity: str) -> Dict[str, int]:
    """Extrae todas las citaciones de una entidad desde los JSONs."""
    fields = ENTITY_FIELDS.get(entity, [])
    if not fields:
        raise ValueError(f"Entidad no soportada: {entity}")

    ingest_path = Path(INGEST_PATH)
    if not ingest_path.exists():
        raise ValueError(f"Path de ingesta no existe: {ingest_path}")

    print(f"Escaneando archivos JSON en: {ingest_path}")
    
    all_citations = []
    file_count = 0
    
    # Recorrer todos los archivos JSON
    for json_file in ingest_path.rglob("*.json"):
        citations = extract_citations_from_json(json_file, fields)
        all_citations.extend(citations)
        file_count += 1
        
        if file_count % 100 == 0:
            print(f"  Procesados {file_count} archivos...")

    print(f"  Total archivos procesados: {file_count}")
    print(f"  Total citaciones encontradas: {len(all_citations)}")

    # Contar frecuencias
    counter = Counter(all_citations)
    return dict(counter)


def main():
    parser = argparse.ArgumentParser(
        description="Extrae citaciones directamente de archivos JSON"
    )
    parser.add_argument(
        "--entity",
        choices=list(ENTITY_FIELDS.keys()),
        help="Entidad específica a extraer",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Extraer todas las entidades",
    )
    parser.add_argument(
        "--output-dir",
        default=OUTPUT_DIR,
        help=f"Directorio de salida (default: {OUTPUT_DIR})",
    )
    args = parser.parse_args()

    if not args.entity and not args.all:
        parser.error("Debes especificar --entity o --all")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    entities = [args.entity] if args.entity else list(ENTITY_FIELDS.keys())

    for entity in entities:
        print(f"\n{'='*60}")
        print(f"Extrayendo: {entity.upper()}")
        print(f"{'='*60}")

        try:
            citations = extract_entity_citations(entity)
            
            # Convertir a formato para portada-s-index
            terms = [
                {"term": term, "frequency": freq}
                for term, freq in citations.items()
            ]

            output_file = output_dir / f"{entity}_citations.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "entity": entity,
                        "total_unique_terms": len(terms),
                        "total_citations": sum(t["frequency"] for t in terms),
                        "terms": terms,
                    },
                    f,
                    ensure_ascii=False,
                    indent=2,
                )

            print(f"  ✓ Guardado en: {output_file}")
            print(f"  → {len(terms)} términos únicos")
            print(f"  → {sum(t['frequency'] for t in terms)} citaciones totales")

        except Exception as e:
            print(f"  ✗ Error: {e}")

    print(f"\n✓ Extracción completada")


if __name__ == "__main__":
    main()
