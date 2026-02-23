import os
from dagster import Definitions, load_assets_from_modules, define_asset_job, in_process_executor
from dagster_pyspark import PySparkResource
from dagster_portada_project.resources.delta_data_layer_resource import DeltaDataLayerResource, RedisConfig, RedisClient
from dagster_portada_project.assets import boat_fact_ingestion_assets, entity_ingestion_assets
from dagster_portada_project.utilities import data_layer_builder_config_to_dagster_pyspark
from dagster_portada_project.sensors.ingestion_sensors import create_failure_sensor


boat_fact_all_assets = load_assets_from_modules([boat_fact_ingestion_assets], group_name="grup_boat_fact")
entity_all_assets = load_assets_from_modules([entity_ingestion_assets], group_name="grup_entity")

entry_ingestion = define_asset_job(
    name="entry_ingestion",
    selection="group:grup_boat_fact",
    tags={"process": "ingestion"},
)

entity_ingestion = define_asset_job(
    name="entity_ingestion",
    selection="group:grup_entity",
    tags={"process": "ingestion"},
)

cfg_path = os.getenv("DATA_LAYER_CONFIG", "config/delta_data_layer_config.json")
redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = os.getenv("REDIS_PORT", "5700")

jobs = [entity_ingestion, entry_ingestion]

redi_cfg = RedisConfig(host=redis_host, port=redis_port)


def callback_error(param, log):
    if "ingested_entity_file" in param["run_config"]["ops"]:
        path = param["run_config"]["ops"]["ingested_entity_file"]["config"]["local_path"]
    else:        
        path = param["run_config"]["ops"]["ingested_entry_file"]["config"]["local_path"]

    if param["asset"] != "update_data_base_for_entity":
        redis_client = redi_cfg.get_redis_client()
        file_found = redis_client.update_file(path, RedisClient.ERROR_STATUS)

        if file_found:
            log.info(f"Updated status to Processing for entity file: {path}")
        else:
            log.warning(f"Entity file not found in Redis with path: {path}")
    else:
        log.error("database redis is not localized")
    if os.path.exists(path):
        os.remove(path)
        
        
ingestion_error_sensor = create_failure_sensor(jobs, "error_sensor", callback_error)


spark_config = data_layer_builder_config_to_dagster_pyspark(cfg_path)
py_spark_resource = PySparkResource(spark_config=spark_config)
defs = Definitions(
    assets=[*boat_fact_all_assets, *entity_all_assets],
    resources={
        "py_spark_resource": py_spark_resource,
        "datalayer": DeltaDataLayerResource(py_spark_resource=py_spark_resource),
        "redis_config": redi_cfg
    },
    sensors=[ingestion_error_sensor],
    jobs=[entity_ingestion, entry_ingestion]
)

