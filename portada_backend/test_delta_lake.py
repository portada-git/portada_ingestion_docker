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
    print("\n--- Testing Known Entities ---")
    try:
        entity_to_test = "flag"
        print(f"Reading known entities for '{entity_to_test}'...")
        df_ke_raw = boat_fact_cleaning.read_raw_entities(entity_to_test)
        df_ke_entities = boat_fact_cleaning.get_known_entity_voices(
            df_entities=df_ke_raw
        )

        print(
            f"Structure of Known Entities {entity_to_test.capitalize()} (id=name, voice):"
        )
        df_ke_entities.printSchema()
        df_ke_entities.show(5)
    except Exception as e:
        print(f"Error testing known entities: {e}")


if __name__ == "__main__":
    run_test()
