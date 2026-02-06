from dagster import Definitions, load_assets_from_modules
from dagster_portada_project.assets.boat_fact_ingestion_assets import ingestion
from dagster_portada_project.resources.delta_data_layer_resource import DeltaDataLayerResource
from dagster_portada_project.assets import boat_fact_ingestion_assets
from dagster_portada_project.utilities import data_layer_builder_config_to_dagster_pyspark
from dagster_pyspark import PySparkResource
import os



all_assets = load_assets_from_modules([boat_fact_ingestion_assets])

cfg_path = os.getenv("DATA_LAYER_CONFIG", "config/delta_data_layer_config.json")
redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = os.getenv("REDIS_PORT", "5700")


spark_config = data_layer_builder_config_to_dagster_pyspark(cfg_path)
py_spark_resource = PySparkResource(spark_config=spark_config)
defs = Definitions(
    assets=all_assets,
    resources={
        "py_spark_resource": py_spark_resource,
        "datalayer": DeltaDataLayerResource(py_spark_resource=py_spark_resource),
        "redis_config":{"host":redis_host, "port":redis_port}
    },
    jobs=[ingestion]
)

