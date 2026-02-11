import os
from dagster import Definitions, load_assets_from_modules, define_asset_job, in_process_executor
from dagster_pyspark import PySparkResource
from dagster_portada_project.resources.delta_data_layer_resource import DeltaDataLayerResource, RedisConfig
from dagster_portada_project.assets import boat_fact_ingestion_assets, entity_ingestion_assets
from dagster_portada_project.utilities import data_layer_builder_config_to_dagster_pyspark


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

spark_config = data_layer_builder_config_to_dagster_pyspark(cfg_path)
py_spark_resource = PySparkResource(spark_config=spark_config)
defs = Definitions(
    assets=[*boat_fact_all_assets, *entity_all_assets],
    resources={
        "py_spark_resource": py_spark_resource,
        "datalayer": DeltaDataLayerResource(py_spark_resource=py_spark_resource),
        "redis_config": RedisConfig(host=redis_host, port=redis_port)
    },
    jobs=[entity_ingestion, entry_ingestion]
)

