import argparse
import json
import os
import platform
from dagster_graphql import DagsterGraphQLClient


def get_args(hostname_default, port_default, schema_default, mapping_dafault):
    parser = argparse.ArgumentParser(prog="cleaning_for_docker", description="Run the cleaning process for portada data lake using docker")
    parser.add_argument("-h","--host", default=hostname_default, help="dugster host name")
    parser.add_argument("-p","--port", type=int, default=port_name, help="dugster port number")
    parser.add_argument("-s","--schema", default=schema_default, help="path for the schema file")
    parser.add_argument("-m","--mapping", default=mapping_dafault, help="path for the mapping file")

    args = parser.parse_args()
    return args

if __name__ == "__main__":
    mapping = "data_layer_config/mapping_to_clean_chars.json"
    schema = "data_layer_config/schema.json"
    hostname = "localhost"
    port_number=3000

    args = get_args(hostname, port_number, schema, mapping)
    hostname = args.host
    port_number = args.port
    schema = args.schema
    mapping = args.mapping
    if os.path.exists(mapping):
        with open(mapping) as f:
            mapping_json = json.load(f)
    if os.path.exists(schema):
        with open(schema) as f:
            schema_json = json.load(f)

    client = DagsterGraphQLClient(hostname=hostname, port_number=port_number)
    client.submit_job_execution(
        job_name="boat_fact_cleaning",
        run_config={
            "ops": {"first_entry_cleaning": {"config": {"mapping_to_clean_chars": mapping_json, "schema": schema_json}}}
        }
    )
