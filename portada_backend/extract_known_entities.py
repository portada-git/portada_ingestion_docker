"""
Script para extraer todas las entidades conocidas (voces) del Delta Lake
y guardarlas en un JSON listo para usar en algoritmos de similitud.

Formato de salida:
{
  "flag": { "CANONICAL_NAME": ["voz1", "voz2", ...], ... },
  "ship_type": { ... },
  ...
}

Uso (dentro del contenedor api):
  python extract_known_entities.py
  python extract_known_entities.py --output /app/output/entities.json
"""

import argparse
import json
import os
import sys
from pathlib import Path

from portada_data_layer import PortadaBuilder
from portada_data_layer.portada_cleaning import BoatFactCleaning


# Entidades a extraer — mismas que ENTITY_SPECS del servicio de similitud
ENTITIES = [
    "flag",
    "ship_type",
    "ship_tons",
    "port",
    "comodity",
    "unit",
    "master_role",
    "travel_duration",
]

DATA_LAYER_CONFIG_PATH = os.getenv(
    "CONFIG_PATH", "/app/config/delta_data_layer_config.json"
)
DEFAULT_OUTPUT = "/app/output/known_entities.json"


def build_layer() -> BoatFactCleaning:
    with open(DATA_LAYER_CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)

    builder = PortadaBuilder(config)
    layer = builder.build(BoatFactCleaning.__name__)
    layer.start_session()
    return layer


def collect_voices(layer: BoatFactCleaning, entity: str) -> dict:
    """Extrae voces de una entidad y las agrupa por nombre canónico."""
    try:
        df = layer.get_known_entity_voices(known_entity=entity)
        rows = df.collect()
    except Exception as e:
        print(f"  [WARN] No se pudieron obtener voces para '{entity}': {e}")
        return {}

    result: dict = {}
    for row in rows:
        data = row.asDict(True)
        voice = str(data.get("voice", "")).strip()
        canonical = str(data.get("name", "")).strip()
        if voice and canonical:
            result.setdefault(canonical, [])
            if voice not in result[canonical]:
                result[canonical].append(voice)

    return result


def main():
    parser = argparse.ArgumentParser(description="Extrae entidades conocidas del Delta Lake")
    parser.add_argument(
        "--output", default=DEFAULT_OUTPUT,
        help=f"Ruta del JSON de salida (default: {DEFAULT_OUTPUT})"
    )
    parser.add_argument(
        "--entities", nargs="+", default=ENTITIES,
        help="Entidades a extraer (default: todas)"
    )
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Config: {DATA_LAYER_CONFIG_PATH}")
    print(f"Output: {output_path}")
    print()

    print("Iniciando sesión Spark...")
    try:
        layer = build_layer()
    except Exception as e:
        print(f"[ERROR] No se pudo iniciar la capa de datos: {e}")
        sys.exit(1)

    all_entities: dict = {}
    for entity in args.entities:
        print(f"Extrayendo '{entity}'...")
        voices = collect_voices(layer, entity)
        all_entities[entity] = voices
        total_voices = sum(len(v) for v in voices.values())
        print(f"  -> {len(voices)} entidades canónicas, {total_voices} voces totales")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_entities, f, ensure_ascii=False, indent=2)

    print(f"\nGuardado en: {output_path}")


if __name__ == "__main__":
    main()
