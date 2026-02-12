import platform
import os
import time
import signal
from dagster_graphql import DagsterGraphQLClient


from watchdog.observers import Observer
from portada_file_monitor.file_event_handler import QueuedPortadaIngestionEventHandler

so = platform.system()
if so == "Darwin":
    path_to_watch = "/Users/josepcanellas/tmp/json_data"
    config_path = "/Users/josepcanellas/Dropbox/feinesJordi/github/dagster_portada_project/dagster_portada_project/config/delta_data_layer_config.json"
else:
    path_to_watch = "/home/josep/tmp/json_data"
    config_path = "/home/josep/Dropbox/feinesJordi/github/dagster_portada_project/dagster_portada_project/config/delta_data_layer_config.json"

# Creem l'observador i el manejador
config_path = os.getenv("DATA_LAYER_CONFIG", config_path)
path_to_watch =  os.getenv("PATH_TO_WATCH", path_to_watch)
host = os.getenv("DAGSTER_HOST", "localhost")	
redis_port=os.getenv("REDIS_PORT", 6379)
redis_host=os.getenv("REDIS_HOST", "localhost")
event_handler = QueuedPortadaIngestionEventHandler(host=redis_host, port=redis_port, db=2)


def process_file(path_file, file_type=None, user_or_entity=None):
    if file_type.lower() == "entity":
        dagster_process_entity(path_file, user_or_entity)        
    else:
        dagster_process_entry(path_file, user_or_entity)



def dagster_process_entry(ruta_fitxer, user):
    client = DagsterGraphQLClient(hostname=host, port_number=3000)
    client.submit_job_execution(
        job_name="entry_ingestion",
        run_config={
            "ops": {"ingested_entry_file": {"config": {"local_path": ruta_fitxer, "user": user}}},
            "resources": {
                "datalayer": {
                    "config": {
                        "config_path": config_path,
                        "job_name": "ingestion",
                    }
                }
            }
        }
    )


def dagster_process_entity(ruta_fitxer, entity_type):
    client = DagsterGraphQLClient(hostname=host, port_number=3000)
    client.submit_job_execution(
        job_name="entity_ingestion",
        run_config={
            "ops": {"ingested_entity_file": {"config": {"local_path": ruta_fitxer, "entity_type": entity_type}}},
            "resources": {
                "datalayer": {
                    "config": {
                        "config_path": config_path,
                        "job_name": "ingestion",
                    }
                }
            }
        }
    )


event_handler.set_path_to_observe(path_to_watch).set_file_process_function(process_file).set_observer(Observer()).start()

# Definim una funció interna per gestionar la sortida neta
def shutdown_handler(signum, frame):
    print("\nSenyal d'aturada rebut. Tancant portada_file_monitor...")
    event_handler.stop()
    # El programa finalitzarà naturalment després del stop/join


# Capturem SIGINT (Ctrl+C) i SIGTERM (el que envia Docker per aturar)
signal.signal(signal.SIGINT, shutdown_handler)
signal.signal(signal.SIGTERM, shutdown_handler)

print("Monitor en espera permanent. Prem Ctrl+C per aturar.")

# Aquí es queda realment "adormit" fins que rep un senyal
# A Windows, signal.pause() no existeix; caldria seguir amb el bucle sleep
# Però a Docker (Linux) és el mètode ideal.
try:
    signal.pause()
except AttributeError:
    # Fallback per a sistemes que no són Unix (Windows)
    try:
        while True:
            # El procés principal es queda aquí esperant
            time.sleep(1)
    except KeyboardInterrupt:
        event_handler.stop()
        print("\nMonitorització aturada.")


