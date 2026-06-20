import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "generate_similarity_with_datalayer.py"


def load_module():
    spec = importlib.util.spec_from_file_location("generate_similarity_with_datalayer", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeRow:
    def __init__(self, **data):
        self._data = data

    def asDict(self, recursive=False):
        return dict(self._data)


class FakeDataFrame:
    def __init__(self, rows):
        self._rows = rows
        self.columns = ["citation"]

    def count(self):
        return len(self._rows)

    def collect(self):
        return list(self._rows)


class FakeLayer:
    def __init__(self):
        self.read_entities = []
        self.read_entries_called = False
        self.cleaned_entries = []
        self.normalized_entries = []

    def read_raw_entities(self, entity):
        self.read_entities.append(entity)
        return FakeDataFrame([FakeRow(name="Barcelona", voices=["Bcn", "Barna"])])

    def get_known_entity_voices(self, df_entities):
        return FakeDataFrame([
            FakeRow(name="Barcelona", voice="Bcn"),
            FakeRow(name="Barcelona", voice="Barna"),
            FakeRow(name="Valencia", voice="Valencia"),
        ])

    def read_raw_entries(self):
        self.read_entries_called = True
        return FakeDataFrame([FakeRow(entry_id="1")])

    def cleaning_entries(self, df_entries, saving_original_data=True):
        self.cleaned_entries.append((df_entries, saving_original_data))
        return FakeDataFrame([FakeRow(entry_id="1", cleaned=True)])

    def normalize_strings_for_ship_entries(self, df_entries):
        self.normalized_entries.append(df_entries)
        return FakeDataFrame([FakeRow(entry_id="1", normalized=True)])

    def extract_ship_types(self, df_entries):
        rows = df_entries.collect()
        if not rows or not rows[0].asDict().get("normalized"):
            return FakeDataFrame([])
        return FakeDataFrame([FakeRow(citation="Vapor"), FakeRow(citation="Vapor")])


class MissingEntityLayer(FakeLayer):
    def read_raw_entities(self, entity):
        self.read_entities.append(entity)
        return None


class FakeVoiceList:
    @staticmethod
    def from_dict(entity_type, data):
        return {"entity_type": entity_type, "data": data}


class FakeSimilarityService:
    def __init__(self):
        self.calls = []
        self.active_algorithms = ["levenshtein_ratio", "jaro_winkler", "ngram_3"]
        self.config = self

    def allowed_names_for_entity(self, entity_type):
        return ["ngram_3"]

    def evaluate(self, terms_input, voice_list):
        self.calls.append((terms_input, voice_list))
        return [
            {
                "term": "Vapor",
                "frequency": 2,
                "allowed_algorithms": ["ngram_3"],
                "algorithm_scores": [
                    {"algorithm": "levenshtein_ratio", "score": 0.8},
                    {"algorithm": "jaro_winkler", "score": 0.9},
                    {"algorithm": "ngram_3", "score": 1.0},
                ],
            }
        ]


class DataLayerSimilarityScriptTests(unittest.TestCase):
    def test_collect_known_voices_uses_datalayer_methods(self):
        module = load_module()
        layer = FakeLayer()

        voices = module.collect_known_voices(layer, "port")

        self.assertEqual(layer.read_entities, ["port"])
        self.assertEqual(voices, {
            "Barcelona": ["Bcn", "Barna"],
            "Valencia": ["Valencia"],
        })

    def test_collect_known_voices_falls_back_to_json_when_entity_is_missing_in_datalayer(self):
        module = load_module()
        layer = MissingEntityLayer()
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False) as f:
            json.dump({"unit": {"tonelada": ["tn", "tons"], "kilo": ["kg"]}}, f)
            fallback_path = f.name

        try:
            voices = module.collect_known_voices(layer, "unit", fallback_known_entities_path=fallback_path)
        finally:
            Path(fallback_path).unlink(missing_ok=True)

        self.assertEqual(layer.read_entities, ["unit"])
        self.assertEqual(voices, {"tonelada": ["tn", "tons"], "kilo": ["kg"]})


    def test_disable_unavailable_optional_algorithms_keeps_required_algorithms_enabled(self):
        module = load_module()
        config = {
            "algorithms": {
                "levenshtein_ratio": {"enabled": True},
                "semantic_text2vec": {"enabled": True},
                "sentence_transformer_LABSE": {"enabled": True},
                "sentence_transformer_mpnet": {"enabled": True},
                "fasttext": {"enabled": True},
            }
        }

        disabled = module.disable_unavailable_optional_algorithms(
            config,
            available_modules={"text2vec": False, "sentence_transformers": False, "fasttext": True},
        )

        self.assertEqual(disabled, [
            "semantic_text2vec",
            "sentence_transformer_LABSE",
            "sentence_transformer_mpnet",
        ])
        self.assertTrue(config["algorithms"]["levenshtein_ratio"]["enabled"])
        self.assertTrue(config["algorithms"]["fasttext"]["enabled"])
        self.assertFalse(config["algorithms"]["semantic_text2vec"]["enabled"])

    def test_normalize_runtime_devices_falls_back_to_cpu_when_cuda_is_unavailable(self):
        module = load_module()
        config = {
            "algorithms": {
                "byt5": {
                    "params": {
                        "device": "cuda",
                        "torch_dtype": "bfloat16",
                    }
                },
                "semantic_model": {
                    "params": {
                        "device": "cuda",
                    }
                },
                "levenshtein_ratio": {"params": {}},
            }
        }

        changes = module.normalize_runtime_devices(config, cuda_available=False)

        self.assertEqual(config["algorithms"]["byt5"]["params"]["device"], "cpu")
        self.assertEqual(config["algorithms"]["byt5"]["params"]["torch_dtype"], "float32")
        self.assertEqual(config["algorithms"]["semantic_model"]["params"]["device"], "cpu")
        self.assertEqual(
            changes,
            [
                "byt5.device cuda->cpu",
                "semantic_model.device cuda->cpu",
                "byt5.torch_dtype bfloat16->float32",
            ],
        )

    def test_run_similarity_generation_reads_entries_and_known_voices_from_datalayer(self):
        module = load_module()
        layer = FakeLayer()
        service = FakeSimilarityService()

        results = module.run_similarity_generation(
            layer=layer,
            service=service,
            voice_list_factory=FakeVoiceList,
            entities=["ship_type"],
        )

        self.assertTrue(layer.read_entries_called)
        self.assertEqual(layer.read_entities, ["ship_type"])
        self.assertEqual(results["source"], "py-portada-data-layer")
        self.assertEqual(results["entities"]["ship_type"]["status"], "success")
        self.assertNotIn("coverage", results["entities"]["ship_type"])
        self.assertEqual(
            results["entities"]["ship_type"]["available_algorithms"],
            ["levenshtein_ratio", "jaro_winkler", "ngram_3"],
        )
        self.assertEqual(results["entities"]["ship_type"]["allowed_algorithms"], ["ngram_3"])
        self.assertNotIn("classification", results["entities"]["ship_type"]["results"][0])
        self.assertEqual(service.calls[0][0], [{"term": "Vapor", "frequency": 2}])

    def test_run_similarity_generation_cleans_entries_before_extracting_citations(self):
        module = load_module()
        layer = FakeLayer()
        service = FakeSimilarityService()

        module.run_similarity_generation(
            layer=layer,
            service=service,
            voice_list_factory=FakeVoiceList,
            entities=["ship_type"],
        )

        self.assertEqual(len(layer.cleaned_entries), 1)
        self.assertIs(layer.cleaned_entries[0][0].collect()[0].asDict()["entry_id"], "1")
        self.assertFalse(layer.cleaned_entries[0][1])
        self.assertEqual(len(layer.normalized_entries), 1)


if __name__ == "__main__":
    unittest.main()
