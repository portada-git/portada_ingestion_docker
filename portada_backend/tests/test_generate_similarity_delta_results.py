import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "generate_similarity_delta_results.py"


def load_module():
    spec = importlib.util.spec_from_file_location("generate_similarity_delta_results", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DeltaResultsScriptTests(unittest.TestCase):
    def test_resolve_similarity_results_root_uses_spark_config_base_and_project(self):
        module = load_module()

        root = module.resolve_similarity_results_root({
            "protocol": "file://",
            "base_path": "/app/delta_lake/",
            "project_data_name": "portada_project",
        })

        self.assertEqual(root, "/app/delta_lake/portada_project/similarity_results")

    def test_disable_semantic_model_removes_it_from_algorithms_and_entity_lists(self):
        module = load_module()
        config = {
            "algorithms": {
                "levenshtein_ratio": {"threshold": 0.7},
                "semantic_model": {"threshold": 0.9},
            },
            "algorithm_per_entity": {
                "port": ["levenshtein_ratio", "semantic_model"],
                "ship_type": ["semantic_model"],
            },
        }

        disabled = module.disable_forced_excluded_algorithms(config)

        self.assertEqual(disabled, ["semantic_model"])
        self.assertNotIn("semantic_model", config["algorithms"])
        self.assertEqual(config["algorithm_per_entity"]["port"], ["levenshtein_ratio"])
        self.assertEqual(config["algorithm_per_entity"]["ship_type"], [])

    def test_build_run_record_contains_output_root_and_no_json_target(self):
        module = load_module()

        record = module.build_run_record(
            run_id="run-1",
            output_root="/app/delta_lake/portada_project/similarity_results",
            source="py-portada-data-layer",
            total_entries=10,
            selected_entities=["port"],
            disabled_algorithms=["semantic_model"],
            runtime_device_changes=["byt5.device cuda->cpu"],
            status="success",
            error_message="",
        )

        self.assertEqual(record["run_id"], "run-1")
        self.assertEqual(record["output_root"], "/app/delta_lake/portada_project/similarity_results")
        self.assertEqual(record["disabled_algorithms"], ["semantic_model"])
        self.assertNotIn("output_file", record)

    def test_collect_delta_known_voices_reads_name_and_voices_schema(self):
        module = load_module()

        class FakeDataFrame:
            def collect(self):
                return [
                    {"name": "Barcelona", "voices": ["Bcn", "Barna", "Bcn"]},
                    {"name": "Valencia", "voices": ["Valencia"]},
                ]

        class FakeLayer:
            def __init__(self):
                self.read_entities = []

            def read_raw_entities(self, entity_name):
                self.read_entities.append(entity_name)
                return FakeDataFrame()

        layer = FakeLayer()

        voices = module.collect_delta_known_voices(layer, "port")

        self.assertEqual(layer.read_entities, ["port"])
        self.assertEqual(voices, {
            "Barcelona": ["Bcn", "Barna"],
            "Valencia": ["Valencia"],
        })

    def test_collect_delta_known_voices_fails_instead_of_json_fallback_when_delta_has_no_voices(self):
        module = load_module()

        class EmptyDataFrame:
            def collect(self):
                return [{"name": "Barcelona", "voices": []}]

        class FakeLayer:
            def read_raw_entities(self, entity_name):
                return EmptyDataFrame()

        with self.assertRaises(RuntimeError):
            module.collect_delta_known_voices(FakeLayer(), "port")


if __name__ == "__main__":
    unittest.main()
