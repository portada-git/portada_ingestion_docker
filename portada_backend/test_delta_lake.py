import os
import json
import logging
from pathlib import Path

# Attempt to import from the library
try:
    from portada_data_layer import PortadaBuilder
    from portada_data_layer.portada_cleaning import BoatFactCleaning

    PORTADA_AVAILABLE = True
except ImportError:
    PORTADA_AVAILABLE = False
    print("WARNING: portada_data_layer not found.")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_test():
    if not PORTADA_AVAILABLE:
        print("Cannot run test: portada_data_layer library not available.")
        return

    # 1. Load Configuration
    config_path = os.getenv("CONFIG_PATH", "/app/config/delta_data_layer_config.json")
    if not os.path.exists(config_path):
        # Local path for testing if not in container
        config_path = str(
            Path(__file__).resolve().parents[1]
            / "data_layer_config"
            / "delta_data_layer_config.json"
        )

    if os.path.exists(config_path):
        with open(config_path) as f:
            config = json.load(f)
    else:
        print(f"Config file not found at {config_path}")
        return

    # Override base_path when running inside the Docker container
    # The config file has the host path, but inside the container
    # the delta_lake volume is mounted at /app/delta_lake
    delta_lake_env = os.getenv("DELTA_LAKE_PATH")
    if delta_lake_env and os.path.exists(delta_lake_env):
        config["base_path"] = delta_lake_env
        print(f"Overriding base_path to container path: {delta_lake_env}")

    print(f"Loaded config from {config_path}")

    # 2. Instantiate BoatFactCleaning
    try:
        data_layer_builder = PortadaBuilder(config)
        boat_fact_cleaning = BoatFactCleaning(builder=data_layer_builder)
        boat_fact_cleaning.start_session()
        print("Successfully instantiated BoatFactCleaning")
    except Exception as e:
        print(f"Error instantiating BoatFactCleaning: {e}")
        return

    # 3. Input de datos
    print("\n--- Testing Data Input ---")
    try:
        # Si no tenemos datos limpios read_raw_entries, else read_ship_entries/read_delta
        print("Reading raw entries...")
        df = boat_fact_cleaning.read_raw_entries()

        if df is None or df.count() == 0:
            print("No raw entries found, trying read_ship_entries...")
            df = boat_fact_cleaning.read_ship_entries()

        print("Data Structure (ship_entries):")
        df.printSchema()
        df.show(5, truncate=False)

    except Exception as e:
        print(f"Error reading ship_entries: {e}")
        df = None

    # 4. Extract Ports
    if df:
        print("\n--- Extracting Ports ---")
        try:
            df_puertos = boat_fact_cleaning.extract_ports(
                df, from_port_of_calls=False, from_arrival_port=False
            )
            print("Structure of extracted ports (ID, citation):")
            df_puertos.printSchema()
            df_puertos.show(5)
        except Exception as e:
            print(f"Error extracting ports: {e}")

        # 5. Extract Ship Types
        print("\n--- Extracting Ship Types ---")
        try:
            df_ship_types = boat_fact_cleaning.extract_ship_types(df)
            print("Structure of extracted ship types (ID, citation):")
            df_ship_types.printSchema()
            df_ship_types.show(5)
        except Exception as e:
            print(f"Error extracting ship types: {e}")

    # 6. Known Entities
    print("\n--- Testing All Known Entities ---")
    
    # Try ingest path first (RAW level in the library), then bronze as fallback
    base = Path(config["base_path"]) / config["project_data_name"]
    known_entities_path = base / "ingest" / "known_entities"
    if not known_entities_path.exists():
        known_entities_path = base / "bronze" / "known_entities"
    
    entities_to_test = []
    if known_entities_path.exists():
        entities_to_test = [d.name for d in known_entities_path.iterdir() if d.is_dir() and d.name != "original_files"]
    else:
        # Fallback list
        entities_to_test = ["comodity", "flag", "master_role", "port", "ship_tons", "ship_type", "travel_duration", "unit"]

    all_entities_json = {}

    for entity in sorted(entities_to_test):
        print(f"\n  Processing Known Entity: '{entity}'...")
        try:
            df_ke_raw = boat_fact_cleaning.read_raw_entities(entity)
            if df_ke_raw is None or df_ke_raw.count() == 0:
                print(f"  Warning: No data for '{entity}'")
                all_entities_json[entity] = {}
                continue
            
            df_ke_entities = boat_fact_cleaning.get_known_entity_voices(
                df_entities=df_ke_raw
            )

            if df_ke_entities is None:
                print(f"  Warning: No voices for '{entity}'")
                all_entities_json[entity] = {}
                continue

            # Collect all rows and group by name
            rows = df_ke_entities.collect()
            entity_dict = {}
            for row in rows:
                name = row["name"]
                voice = row["voice"]
                if name not in entity_dict:
                    entity_dict[name] = []
                entity_dict[name].append(voice)
            
            all_entities_json[entity] = entity_dict
            print(f"  ✓ '{entity}': {len(entity_dict)} entries, {len(rows)} total voices")

        except Exception as e:
            print(f"  Error with '{entity}': {e}")
            all_entities_json[entity] = {"error": str(e)}

    # Write JSON output
    output_path = Path("/tmp") / "known_entities.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_entities_json, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ JSON saved to: {output_path}")
    print(f"  Entities: {len(all_entities_json)}")
    total_names = sum(len(v) for v in all_entities_json.values() if isinstance(v, dict))
    print(f"  Total unique names: {total_names}")


if __name__ == "__main__":
    run_test()
