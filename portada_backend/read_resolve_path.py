import inspect
from portada_data_layer import PortadaBuilder
from portada_data_layer.portada_cleaning import BoatFactCleaning
import json

config_path = "/home/danro/1Workspace/PortAda/Portada work/portada_ingestion_docker/data_layer_config/delta_data_layer_config.json"
with open(config_path, "r") as f:
    config = json.load(f)

builder = PortadaBuilder(config)
boat_cleaning = BoatFactCleaning(builder=builder)

print("--- _resolve_path for ('known_entities', 'flag') ---")
print(boat_cleaning._resolve_path("known_entities", "flag"))
